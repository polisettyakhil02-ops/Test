import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Store } from '@/db/collections'

/**
 * Outbox delivery.
 *
 * Posting writes an event row inside the same transaction as the ledger entry,
 * so a rolled-back posting cannot leave a webhook already delivered and a
 * committed one cannot fail to notify. That is only half the pattern: something
 * has to drain the table afterwards, which is this.
 *
 * Delivery is at-least-once. The receiver must be idempotent on `id`, which is
 * why the id is in the body and in a header rather than only in the payload.
 */

/** Attempts after which a row is left alone for a human to look at. */
export const MAX_ATTEMPTS = 8

/** Exponential, capped at an hour: 1m, 2m, 4m ... 60m. */
export function backoffSeconds(attempts: number): number {
  return Math.min(60 * 2 ** Math.max(attempts - 1, 0), 3600)
}

/**
 * `t=<unix>,v1=<hex>` over `<t>.<body>`.
 *
 * The timestamp is inside the signed string, not merely alongside it, so a
 * captured request cannot be replayed later with a fresh timestamp.
 */
export function signPayload(secret: string, body: string, timestampSeconds: number): string {
  const mac = createHmac('sha256', secret).update(`${timestampSeconds}.${body}`).digest('hex')
  return `t=${timestampSeconds},v1=${mac}`
}

/**
 * Verifies a signature the way a receiver would.
 *
 * Exported because it is the half of the contract that has to be gettable
 * right by whoever consumes these events -- and because it is what makes
 * signPayload testable against something other than itself.
 */
export function verifySignature(
  secret: string,
  body: string,
  header: string,
  options: { nowSeconds?: number; toleranceSeconds?: number } = {},
): boolean {
  const parts = Object.fromEntries(
    header.split(',').map((piece) => {
      const index = piece.indexOf('=')
      return [piece.slice(0, index).trim(), piece.slice(index + 1).trim()]
    }),
  )

  const timestamp = Number(parts.t)
  const provided = String(parts.v1 ?? '')
  if (!Number.isFinite(timestamp) || provided.length === 0) return false

  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000)
  const tolerance = options.toleranceSeconds ?? 300
  if (Math.abs(now - timestamp) > tolerance) return false

  const expected = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(provided, 'utf8')
  // Length has to match before timingSafeEqual will look at the bytes at all.
  return a.length === b.length && timingSafeEqual(a, b)
}

export interface OutboxEvent {
  id: string
  topic: string
  payload: unknown
  createdAt: Date
  attempts: number
}

export interface DrainOptions {
  endpoint: string
  secret: string
  limit?: number
  now?: Date
  /** Injectable for tests; defaults to the platform fetch. */
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export interface DrainResult {
  attempted: number
  delivered: number
  failed: number
  failures: Array<{ id: string; error: string }>
}

/**
 * Claims due events and POSTs them.
 *
 * MongoDB has nothing like `FOR UPDATE SKIP LOCKED`, so claiming works
 * differently: each row is claimed one at a time with `findOneAndUpdate`,
 * which atomically advances `nextAttemptAt` into a short lease window as part
 * of the same operation that selects the row. A second worker's query for "due
 * now" no longer matches that row the instant the first worker claims it —
 * there is no window where two workers can see the same row as available,
 * because there is only ever one atomic operation deciding it, never a select
 * followed by a separate lock. If a worker crashes mid-delivery, the lease
 * simply expires and the row becomes claimable again, which `FOR UPDATE`
 * inside a short-lived transaction did not need to think about, but a queue
 * with workers that can be killed does.
 */
export async function drainOutbox(store: Store, options: DrainOptions): Promise<DrainResult> {
  const now = options.now ?? new Date()
  const limit = options.limit ?? 25
  const fetchImpl = options.fetchImpl ?? fetch
  const result: DrainResult = { attempted: 0, delivered: 0, failed: 0, failures: [] }

  const due = await claimDue(store, { now, limit })
  if (due.length === 0) return result

  for (const event of due) {
    result.attempted += 1
    const body = JSON.stringify({
      id: event.id,
      topic: event.topic,
      createdAt: event.createdAt.toISOString(),
      data: event.payload,
    })

    try {
      const response = await postEvent(fetchImpl, options, event, body, now)

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`.trim())
      }

      await store.outbox.updateOne(
        { _id: event.id },
        { $set: { deliveredAt: now, attempts: event.attempts + 1, lastError: '' } },
      )

      result.delivered += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const attempts = event.attempts + 1

      await store.outbox.updateOne(
        { _id: event.id },
        {
          $set: {
            attempts,
            lastError: message.slice(0, 500),
            nextAttemptAt: new Date(now.getTime() + backoffSeconds(attempts) * 1000),
          },
        },
      )

      result.failed += 1
      result.failures.push({ id: event.id, error: message })
    }
  }

  return result
}

async function postEvent(
  fetchImpl: typeof fetch,
  options: DrainOptions,
  event: OutboxEvent,
  body: string,
  now: Date,
): Promise<Response> {
  const timestamp = Math.floor(now.getTime() / 1000)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000)

  try {
    return await fetchImpl(options.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Billing-Event': event.topic,
        // The receiver dedupes on this. Delivery is at-least-once by design.
        'X-Billing-Delivery': event.id,
        'X-Billing-Signature': signPayload(options.secret, body, timestamp),
      },
      body,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

/** How far into the future a claim reserves a row before it is retryable again. */
const CLAIM_LEASE_MS = 60_000

async function claimDue(store: Store, options: { now: Date; limit: number }): Promise<OutboxEvent[]> {
  const claimed: OutboxEvent[] = []

  for (let i = 0; i < options.limit; i += 1) {
    const row = await store.outbox.findOneAndUpdate(
      { deliveredAt: null, nextAttemptAt: { $lte: options.now }, attempts: { $lt: MAX_ATTEMPTS } },
      { $set: { nextAttemptAt: new Date(options.now.getTime() + CLAIM_LEASE_MS) } },
      { sort: { createdAt: 1 }, returnDocument: 'after' },
    )
    if (!row) break

    claimed.push({ id: row._id, topic: row.topic, payload: row.payload, createdAt: row.createdAt, attempts: row.attempts })
  }

  return claimed
}

export interface OutboxSummary {
  pending: number
  delivered: number
  deadLettered: number
  oldestPendingAt: Date | null
}

/** Counts for the outbox screen. */
export async function outboxSummary(store: Store): Promise<OutboxSummary> {
  const FAR_FUTURE = new Date('9999-12-31T00:00:00Z')

  const [row] = await store.outbox
    .aggregate<{ pending: number; delivered: number; dead: number; oldestOrSentinel: Date }>(
      [
        {
          $group: {
            _id: null,
            pending: {
              $sum: {
                $cond: [
                  { $and: [{ $eq: ['$deliveredAt', null] }, { $lt: ['$attempts', MAX_ATTEMPTS] }] },
                  1,
                  0,
                ],
              },
            },
            delivered: { $sum: { $cond: [{ $ne: ['$deliveredAt', null] }, 1, 0] } },
            dead: {
              $sum: {
                $cond: [
                  { $and: [{ $eq: ['$deliveredAt', null] }, { $gte: ['$attempts', MAX_ATTEMPTS] }] },
                  1,
                  0,
                ],
              },
            },
            // A sentinel far in the future stands in for "delivered" rows, so
            // $min never has to compare a real date against null — BSON orders
            // null below every date, which would otherwise always win.
            oldestOrSentinel: {
              $min: { $cond: [{ $eq: ['$deliveredAt', null] }, '$createdAt', FAR_FUTURE] },
            },
          },
        },
      ],
      { session: store.session },
    )
    .toArray()

  const pending = row?.pending ?? 0

  return {
    pending,
    delivered: row?.delivered ?? 0,
    deadLettered: row?.dead ?? 0,
    oldestPendingAt: pending > 0 && row ? row.oldestOrSentinel : null,
  }
}

/** Puts a dead-lettered or scheduled event back at the front of the queue. */
export async function retryNow(store: Store, id: string, now: Date = new Date()): Promise<void> {
  await store.outbox.updateOne(
    { _id: id, deliveredAt: null },
    { $set: { attempts: 0, nextAttemptAt: now, lastError: '' } },
    { session: store.session },
  )
}
