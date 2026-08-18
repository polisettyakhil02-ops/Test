import { Router } from 'express'
import { desc } from 'drizzle-orm'
import { db } from '@/db'
import { outbox } from '@/db/schema'
import { config } from '@/lib/config'
import { badRequest, handler, param } from '@/lib/errors'
import { MAX_ATTEMPTS, drainOutbox, outboxSummary, retryNow } from '@/domain/webhooks'
import { requireAuth, requireRole, sessionOf } from '@/middleware/auth'

export const outboxRoutes = Router()

outboxRoutes.get(
  '/outbox',
  requireAuth,
  handler(async (req, res) => {
    sessionOf(req)
    const rows = await db.select().from(outbox).orderBy(desc(outbox.createdAt)).limit(100)
    res.json({
      summary: await outboxSummary(db),
      configured: Boolean(config.webhook.endpoint && config.webhook.secret),
      maxAttempts: MAX_ATTEMPTS,
      rows,
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

    const result = await drainOutbox(db, {
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
    await retryNow(db, param(req, 'id'))
    res.json({ ok: true })
  }),
)
