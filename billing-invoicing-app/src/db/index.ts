import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '@/db/schema'

/**
 * Next.js hot-reloads modules in development, which would otherwise open a new
 * connection pool on every save until PostgreSQL refuses new connections.
 * Caching the client on globalThis survives reloads.
 */
declare global {
  var _pgClient: ReturnType<typeof postgres> | undefined
}

function client() {
  const url = process.env.DATABASE_URL

  if (!url) {
    throw new Error(
      'Missing DATABASE_URL. Add it to .env.local, then restart `npm run dev`.',
    )
  }

  if (!globalThis._pgClient) {
    globalThis._pgClient = postgres(url, {
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      // Fail fast rather than letting a page hang on an unreachable database.
      connect_timeout: 10,
      idle_timeout: 20,
    })
  }

  return globalThis._pgClient
}

export const db = drizzle(client(), { schema })

export type Database = typeof db
export * from '@/db/schema'
