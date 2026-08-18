import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '@/db/schema'

/**
 * The database handle, connected on first use rather than on import.
 *
 * Deferring it keeps `import` side-effect free, so a build, a typecheck or a
 * unit test that never touches the database does not need one to exist.
 */

let client: ReturnType<typeof postgres> | undefined
let handle: ReturnType<typeof drizzle<typeof schema>> | undefined

function connection() {
  if (!handle) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('Missing DATABASE_URL.')

    client = postgres(url, {
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      // Fail fast rather than letting a request hang on an unreachable database.
      connect_timeout: 10,
      idle_timeout: 20,
    })
    handle = drizzle(client, { schema })
  }
  return handle
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, property) {
    const real = connection()
    const value = Reflect.get(real, property, real)
    // Bound so `this` inside drizzle never sees the proxy.
    return typeof value === 'function' ? value.bind(real) : value
  },
  has(_target, property) {
    return Reflect.has(connection(), property)
  },
})

/** Closes the pool. Used on shutdown so in-flight queries are not cut off. */
export async function closeDb() {
  if (client) await client.end({ timeout: 5 })
  client = undefined
  handle = undefined
}

export type Database = ReturnType<typeof drizzle<typeof schema>>
export * from '@/db/schema'
