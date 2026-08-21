import { MongoClient } from 'mongodb'
import { makeStore, withSession, type Store } from '@/db/collections'

/**
 * Next.js hot-reloads modules in development, which would otherwise open a new
 * connection pool on every save until MongoDB refuses new connections.
 * Caching the client on globalThis survives reloads.
 */
declare global {
  var _mongoClient: MongoClient | undefined
  var _mongoConnecting: Promise<MongoClient> | undefined
}

function connect(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    throw new Error(
      'Missing MONGODB_URI. Set it in the environment (or .env.local for local development).',
    )
  }

  if (!globalThis._mongoClient) {
    globalThis._mongoClient = new MongoClient(uri, {
      maxPoolSize: Number(process.env.DATABASE_POOL_MAX ?? 10),
      // Fail fast rather than letting a page hang on an unreachable cluster.
      serverSelectionTimeoutMS: 10_000,
    })
  }
  if (!globalThis._mongoConnecting) {
    globalThis._mongoConnecting = globalThis._mongoClient.connect()
  }
  return globalThis._mongoConnecting
}

/**
 * The store for the default database named in the connection string, connected
 * on first use rather than on import.
 *
 * `next build` imports every route module to read its config, so connecting at
 * module scope would make `MONGODB_URI` a *build-time* requirement — and a
 * container image has no database to point at while it is being built.
 * Deferring it means the build needs no database, and a genuinely missing
 * variable still fails loudly, on the first query, with the message above.
 */
export async function getDb(): Promise<Store> {
  const client = await connect()
  return makeStore(client.db(), client)
}

/**
 * Runs `fn` inside a MongoDB multi-document transaction, retrying on the
 * transient errors the driver expects a caller to retry. See the identical
 * helper in the Express backend (billing-platform/backend/src/db/client.ts)
 * for the full explanation — this app and that one share the same domain
 * layer and the same transaction shape, just wired into Next.js instead of
 * Express.
 */
export async function withTransaction<T>(store: Store, fn: (tx: Store) => Promise<T>): Promise<T> {
  const session = store.client.startSession()
  try {
    let result: T | undefined
    await session.withTransaction(
      async () => {
        result = await fn(withSession(store, session))
      },
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        readPreference: 'primary',
      },
    )
    return result as T
  } finally {
    await session.endSession()
  }
}
