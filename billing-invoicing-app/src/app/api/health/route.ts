import { sql } from 'drizzle-orm'
import { db } from '@/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Liveness and readiness in one.
 *
 * It actually queries the database rather than just returning 200: a process
 * that is up but cannot reach PostgreSQL serves nothing but error pages, and a
 * health check that reports it healthy will keep it in the load balancer.
 *
 * Deliberately unauthenticated, and deliberately says nothing beyond up or
 * down — no version, no connection string, no row counts.
 */
export async function GET() {
  try {
    await db.execute(sql`SELECT 1`)
    return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json(
      { status: 'degraded', detail: 'database unreachable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
