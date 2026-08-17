import { createHmac, timingSafeEqual } from 'node:crypto'
import { and, asc, eq, isNull, lte, sql } from 'drizzle-orm'
import { outbox } from '@/db/schema'
import type { Db } from '@/domain/posting'

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
 * `FOR UPDATE SKIP LOCKED` is what makes it safe to run more than one worker:
 * a row being delivered by one is invisible to the others rather than delivered
 * twice in the same instant.
 */
export async function drainOutbox(db: Db, options: DrainOptions): Promise<DrainResult> {
  const now = options.now ?? new Date()
  const limit = options.limit ?? 25
  const fetchImpl = options.fetchImpl ?? fetch
  const result: DrainResult = { attempted: 0, delivered: 0, failed: 0, failures: [] }

  const due = await claimDue(db, { now, limit })
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

      await db
        .update(outbox)
        .set({ deliveredAt: now, attempts: event.attempts + 1, lastError: '' })
        .where(eq(outbox.id, event.id))

      result.delivered += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const attempts = event.attempts + 1

      await db
        .update(outbox)
        .set({
          attempts,
          lastError: message.slice(0, 500),
          nextAttemptAt: new Date(now.getTime() + backoffSeconds(attempts) * 1000),
        })
        .where(eq(outbox.id, event.id))

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

async function claimDue(db: Db, options: { now: Date; limit: number }): Promise<OutboxEvent[]> {
  const rows = await db
    .select()
    .from(outbox)
    .where(
      and(
        isNull(outbox.deliveredAt),
        lte(outbox.nextAttemptAt, options.now),
        sql`${outbox.attempts} < ${MAX_ATTEMPTS}`,
      ),
    )
    .orderBy(asc(outbox.createdAt))
    .limit(options.limit)
    .for('update', { skipLocked: true })

  return rows.map((row: typeof outbox.$inferSelect) => ({
    id: row.id,
    topic: row.topic,
    payload: row.payload,
    createdAt: row.createdAt,
    attempts: row.attempts,
  }))
}

export interface OutboxSummary {
  pending: number
  delivered: number
  deadLettered: number
  oldestPendingAt: Date | null
}

/** Counts for the outbox screen. */
export async function outboxSummary(db: Db): Promise<OutboxSummary> {
  const [row] = await db
    .select({
      pending: sql<string>`COUNT(*) FILTER (WHERE ${outbox.deliveredAt} IS NULL AND ${outbox.attempts} < ${MAX_ATTEMPTS})`,
      delivered: sql<string>`COUNT(*) FILTER (WHERE ${outbox.deliveredAt} IS NOT NULL)`,
      dead: sql<string>`COUNT(*) FILTER (WHERE ${outbox.deliveredAt} IS NULL AND ${outbox.attempts} >= ${MAX_ATTEMPTS})`,
      oldest: sql<Date | null>`MIN(${outbox.createdAt}) FILTER (WHERE ${outbox.deliveredAt} IS NULL)`,
    })
    .from(outbox)

  return {
    pending: Number(row?.pending ?? 0),
    delivered: Number(row?.delivered ?? 0),
    deadLettered: Number(row?.dead ?? 0),
    oldestPendingAt: row?.oldest ? new Date(row.oldest) : null,
  }
}

/** Puts a dead-lettered or scheduled event back at the front of the queue. */
export async function retryNow(db: Db, id: string, now: Date = new Date()) {
  await db
    .update(outbox)
    .set({ attempts: 0, nextAttemptAt: now, lastError: '' })
    .where(and(eq(outbox.id, id), isNull(outbox.deliveredAt)))
}
