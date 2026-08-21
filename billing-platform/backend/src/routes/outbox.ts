import { Router } from 'express'
import { getDb } from '@/db'
import { config } from '@/lib/config'
import { badRequest, handler, param } from '@/lib/errors'
import { MAX_ATTEMPTS, drainOutbox, outboxSummary, retryNow } from '@/domain/webhooks'
import { withId } from '@/lib/serialize'
import { requireAuth, requireRole, sessionOf } from '@/middleware/auth'

export const outboxRoutes = Router()

outboxRoutes.get(
  '/outbox',
  requireAuth,
  handler(async (req, res) => {
    sessionOf(req)
    const store = await getDb()
    const rows = await store.outbox.find({}).sort({ createdAt: -1 }).limit(100).toArray()
    res.json({
      summary: await outboxSummary(store),
      configured: Boolean(config.webhook.endpoint && config.webhook.secret),
      maxAttempts: MAX_ATTEMPTS,
      rows: rows.map(withId),
    })
  }),
)

/**
 * Drains the queue on demand.
 *
 * The worker process is what runs continuously; this is for the moment you have
 * just fixed the receiver and do not want to wait out the backoff.
 */
outboxRoutes.post(
  '/outbox/deliver',
  requireRole('admin'),
  handler(async (req, res) => {
    sessionOf(req)
    if (!config.webhook.endpoint || !config.webhook.secret) {
      throw badRequest('Set WEBHOOK_ENDPOINT and WEBHOOK_SECRET before delivering.')
    }

    const store = await getDb()
    const result = await drainOutbox(store, {
      endpoint: config.webhook.endpoint,
      secret: config.webhook.secret,
    })
    res.json(result)
  }),
)

outboxRoutes.post(
  '/outbox/:id/retry',
  requireRole('admin'),
  handler(async (req, res) => {
    sessionOf(req)
    const store = await getDb()
    await retryNow(store, param(req, 'id'))
    res.json({ ok: true })
  }),
)
