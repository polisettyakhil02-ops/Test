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
  var _db: ReturnType<typeof drizzle<typeof schema>> | undefined
}

function client() {
  const url = process.env.DATABASE_URL

  if (!url) {
    throw new Error(
      'Missing DATABASE_URL. Set it in the environment (or .env.local for local development).',
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

function connection() {
  if (!globalThis._db) globalThis._db = drizzle(client(), { schema })
  return globalThis._db
}

/**
 * The database handle, connected on first use rather than on import.
 *
 * `next build` imports every route module to read its config, so connecting at
 * module scope made DATABASE_URL a *build-time* requirement -- and a container
 * image has no database to point at while it is being built. Deferring it means
 * the build needs no database, and a genuinely missing variable still fails
 * loudly, on the first query, with the message above.
 *
 * Methods are bound to the real instance so `this` inside drizzle never sees
 * the proxy.
 */
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, property) {
    const real = connection()
    const value = Reflect.get(real, property, real)
    return typeof value === 'function' ? value.bind(real) : value
  },
  has(_target, property) {
    return Reflect.has(connection(), property)
  },
})

export type Database = ReturnType<typeof drizzle<typeof schema>>
export * from '@/db/schema'
