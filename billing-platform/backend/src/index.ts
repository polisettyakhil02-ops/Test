import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import { sql } from 'drizzle-orm'
import { closeDb, db } from '@/db'
import { config } from '@/lib/config'
import { errorMiddleware, handler } from '@/lib/errors'
import { withSession } from '@/middleware/auth'
import { authRoutes } from '@/routes/auth'
import { documentRoutes } from '@/routes/documents'
import { masterRoutes } from '@/routes/masters'
import { outboxRoutes } from '@/routes/outbox'
import { reportRoutes } from '@/routes/reports'

export function createApp() {
  const app = express()

  // Behind a reverse proxy in production, so req.protocol and req.ip come from
  // the X-Forwarded-* headers rather than from the socket.
  app.set('trust proxy', 1)
  app.disable('x-powered-by')

  /**
   * The browser app is on a different origin by design, so CORS is load-bearing
   * rather than a formality. `credentials: true` is what lets the session cookie
   * travel, and it is exactly why the origin list is an allowlist and never `*`
   * -- the two are not allowed together, and for good reason.
   */
  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header: curl, a health probe, a server-to-server call.
        if (!origin) return callback(null, true)
        // An unknown origin gets `false`, not an Error. Passing an Error would
        // surface as a 500, which reads as a broken server; `false` simply
        // omits Access-Control-Allow-Origin, and the browser blocks the read
        // itself -- which is what CORS is for.
        callback(null, config.corsOrigins.includes(origin))
      },
      credentials: true,
    }),
  )

  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())

  /**
   * Liveness and readiness in one. It queries the database rather than just
   * returning 200: a process that is up but cannot reach PostgreSQL serves
   * nothing but errors, and a check that reports it healthy keeps it in the
   * load balancer. Unauthenticated, and says nothing else.
   */
  app.get(
    '/api/health',
    handler(async (_req, res) => {
      try {
        await db.execute(sql`SELECT 1`)
        res.set('Cache-Control', 'no-store').json({ status: 'ok' })
      } catch {
        res.status(503).set('Cache-Control', 'no-store').json({
          status: 'degraded',
          detail: 'database unreachable',
        })
      }
    }),
  )

  app.use('/api', withSession)
  app.use('/api/auth', authRoutes)
  app.use('/api', masterRoutes)
  app.use('/api', documentRoutes)
  app.use('/api', reportRoutes)
  app.use('/api', outboxRoutes)

  app.use((_req, res) => {
    res.status(404).json({ error: 'No such endpoint.', fieldErrors: {} })
  })

  app.use(errorMiddleware)
  return app
}

// Started only when run directly, so the tests can import createApp() without
// binding a port.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '')) {
  const app = createApp()
  const server = app.listen(config.port, () => {
    console.log(`API listening on :${config.port}`)
    console.log(`CORS origins: ${config.corsOrigins.join(', ')}`)
  })

  const shutdown = async () => {
    server.close()
    await closeDb()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
