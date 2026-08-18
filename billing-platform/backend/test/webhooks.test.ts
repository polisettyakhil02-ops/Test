import { test, describe, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '@/db/testing'
import { outbox } from '@/db/schema'
import {
  MAX_ATTEMPTS,
  backoffSeconds,
  drainOutbox,
  outboxSummary,
  retryNow,
  signPayload,
  verifySignature,
} from '@/domain/webhooks'

/**
 * The outbox is the half of the transactional-outbox pattern that can actually
 * lose data if it is wrong: an event marked delivered that was not, or a
 * failing endpoint retried in a tight loop until it falls over.
 */

let db: TestDb

before(async () => {
  db = await createTestDb()
})

beforeEach(async () => {
  await db.delete(outbox)
})

async function queue(topic: string, payload: unknown = { hello: 'world' }) {
  const [row] = await db.insert(outbox).values({ topic, payload }).returning()
  return row
}

/** A fetch stand-in that records what it was called with. */
function recordingFetch(responder: (url: string, init: RequestInit) => Response) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const entry = { url: String(url), init: init ?? {} }
    calls.push(entry)
    return responder(entry.url, entry.init)
  }) as unknown as typeof fetch

  return { impl, calls }
}

const CONFIG = { endpoint: 'https://receiver.test/hook', secret: 'sh-secret' }

/**
 * "Now", a moment ahead of the clock.
 *
 * Rows are inserted with `next_attempt_at DEFAULT now()`, so a pinned timestamp
 * stops being due the moment the wall clock passes it -- a test written that
 * way passes all morning and fails after lunch.
 */
const dueNow = () => new Date(Date.now() + 1000)

describe('signing', () => {
  test('a receiver following the documented scheme accepts our signature', () => {
    const body = '{"id":"1"}'
    const header = signPayload('sh-secret', body, 1_800_000_000)

    assert.ok(verifySignature('sh-secret', body, header, { nowSeconds: 1_800_000_000 }))
  })

  test('a different secret does not verify', () => {
    const body = '{"id":"1"}'
    const header = signPayload('sh-secret', body, 1_800_000_000)

    assert.equal(verifySignature('other', body, header, { nowSeconds: 1_800_000_000 }), false)
  })

  test('a tampered body does not verify', () => {
    const header = signPayload('sh-secret', '{"amount":100}', 1_800_000_000)

    assert.equal(
      verifySignature('sh-secret', '{"amount":900}', header, { nowSeconds: 1_800_000_000 }),
      false,
    )
  })

  test('an old signature is refused even though the MAC is correct', () => {
    const body = '{"id":"1"}'
    const header = signPayload('sh-secret', body, 1_800_000_000)

    // Replayed an hour later. The timestamp is inside the signed string, so it
    // cannot be moved forward without the secret.
    assert.equal(
      verifySignature('sh-secret', body, header, { nowSeconds: 1_800_003_600 }),
      false,
    )
  })

  test('a malformed header is refused rather than throwing', () => {
    assert.equal(verifySignature('sh-secret', 'body', 'garbage'), false)
    assert.equal(verifySignature('sh-secret', 'body', 't=abc,v1=zz'), false)
  })
})

describe('backoff', () => {
  test('grows exponentially and stops at an hour', () => {
    assert.equal(backoffSeconds(1), 60)
    assert.equal(backoffSeconds(2), 120)
    assert.equal(backoffSeconds(3), 240)
    assert.equal(backoffSeconds(20), 3600)
  })
})

describe('draining', () => {
  test('a 2xx marks the event delivered and it is not sent twice', async () => {
    await queue('invoice.posted')
    const { impl, calls } = recordingFetch(() => new Response('', { status: 200 }))

    const first = await drainOutbox(db, { ...CONFIG, fetchImpl: impl })
    assert.equal(first.delivered, 1)

    const second = await drainOutbox(db, { ...CONFIG, fetchImpl: impl })
    assert.equal(second.attempted, 0)
    assert.equal(calls.length, 1)
  })

  test('the body and headers are what a receiver needs to dedupe and verify', async () => {
    const row = await queue('invoice.posted', { documentId: 'abc', number: 'INV-00001' })
    const { impl, calls } = recordingFetch(() => new Response('', { status: 200 }))

    const now = dueNow()
    await drainOutbox(db, { ...CONFIG, fetchImpl: impl, now })

    const [call] = calls
    const headers = call.init.headers as Record<string, string>
    const body = String(call.init.body)

    assert.equal(call.url, CONFIG.endpoint)
    assert.equal(headers['X-Billing-Delivery'], row.id)
    assert.equal(headers['X-Billing-Event'], 'invoice.posted')
    assert.deepEqual(JSON.parse(body).data, { documentId: 'abc', number: 'INV-00001' })
    assert.ok(
      verifySignature(CONFIG.secret, body, headers['X-Billing-Signature'], {
        nowSeconds: Math.floor(now.getTime() / 1000),
      }),
    )
  })

  test('a 500 leaves the event pending and schedules it into the future', async () => {
    await queue('invoice.posted')
    const { impl } = recordingFetch(() => new Response('boom', { status: 500 }))

    const now = dueNow()
    const result = await drainOutbox(db, { ...CONFIG, fetchImpl: impl, now })

    assert.equal(result.failed, 1)

    const [row] = await db.select().from(outbox)
    assert.equal(row.deliveredAt, null)
    assert.equal(row.attempts, 1)
    assert.match(row.lastError, /500/)
    assert.equal(row.nextAttemptAt.getTime(), now.getTime() + 60_000)
  })

  test('an event scheduled into the future is not picked up early', async () => {
    await queue('invoice.posted')
    const { impl, calls } = recordingFetch(() => new Response('boom', { status: 500 }))

    const now = dueNow()
    await drainOutbox(db, { ...CONFIG, fetchImpl: impl, now })

    // Half a minute later: still inside the 60s backoff.
    await drainOutbox(db, { ...CONFIG, fetchImpl: impl, now: new Date(now.getTime() + 30_000) })
    assert.equal(calls.length, 1)

    // Ninety seconds later: due again.
    await drainOutbox(db, { ...CONFIG, fetchImpl: impl, now: new Date(now.getTime() + 90_000) })
    assert.equal(calls.length, 2)
  })

  test('a thrown network error is treated exactly like a rejection', async () => {
    await queue('invoice.posted')
    const impl = (async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch

    const result = await drainOutbox(db, { ...CONFIG, fetchImpl: impl })

    assert.equal(result.failed, 1)
    const [row] = await db.select().from(outbox)
    assert.match(row.lastError, /ECONNREFUSED/)
  })

  test('it gives up after MAX_ATTEMPTS rather than hammering forever', async () => {
    const row = await queue('invoice.posted')
    await db
      .update(outbox)
      .set({ attempts: MAX_ATTEMPTS })
      .where(eq(outbox.id, row.id))

    const { impl, calls } = recordingFetch(() => new Response('', { status: 200 }))
    const result = await drainOutbox(db, { ...CONFIG, fetchImpl: impl })

    assert.equal(result.attempted, 0)
    assert.equal(calls.length, 0)
  })

  test('a dead-lettered event can be put back in the queue by hand', async () => {
    const row = await queue('invoice.posted')
    await db
      .update(outbox)
      .set({ attempts: MAX_ATTEMPTS, lastError: 'gave up' })
      .where(eq(outbox.id, row.id))

    await retryNow(db, row.id)

    const { impl } = recordingFetch(() => new Response('', { status: 200 }))
    const result = await drainOutbox(db, { ...CONFIG, fetchImpl: impl })

    assert.equal(result.delivered, 1)
  })

  test('retrying an already-delivered event does nothing', async () => {
    const row = await queue('invoice.posted')
    const { impl } = recordingFetch(() => new Response('', { status: 200 }))
    await drainOutbox(db, { ...CONFIG, fetchImpl: impl })

    await retryNow(db, row.id)

    const after = await drainOutbox(db, { ...CONFIG, fetchImpl: impl })
    assert.equal(after.attempted, 0)
  })

  test('one bad event does not stop the others in the batch', async () => {
    await queue('a.first')
    await queue('b.second')
    await queue('c.third')

    const { impl } = recordingFetch((_url, init) => {
      const topic = (init.headers as Record<string, string>)['X-Billing-Event']
      return new Response('', { status: topic === 'b.second' ? 503 : 200 })
    })

    const result = await drainOutbox(db, { ...CONFIG, fetchImpl: impl })

    assert.equal(result.attempted, 3)
    assert.equal(result.delivered, 2)
    assert.equal(result.failed, 1)
  })

  test('the batch limit is respected', async () => {
    for (let index = 0; index < 5; index += 1) await queue(`topic.${index}`)

    const { impl, calls } = recordingFetch(() => new Response('', { status: 200 }))
    await drainOutbox(db, { ...CONFIG, fetchImpl: impl, limit: 2 })

    assert.equal(calls.length, 2)
  })
})

describe('summary', () => {
  test('counts pending, delivered and dead-lettered separately', async () => {
    const delivered = await queue('delivered.one')
    const dead = await queue('dead.one')
    await queue('pending.one')

    await db
      .update(outbox)
      .set({ deliveredAt: new Date() })
      .where(eq(outbox.id, delivered.id))
    await db.update(outbox).set({ attempts: MAX_ATTEMPTS }).where(eq(outbox.id, dead.id))

    const summary = await outboxSummary(db)

    assert.equal(summary.delivered, 1)
    assert.equal(summary.deadLettered, 1)
    assert.equal(summary.pending, 1)
    assert.ok(summary.oldestPendingAt instanceof Date)
  })
})
