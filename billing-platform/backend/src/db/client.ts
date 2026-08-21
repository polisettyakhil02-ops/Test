import { MongoClient } from 'mongodb'
import { makeStore, withSession, type Store } from '@/db/collections'

/**
 * The database handle, connected on first use rather than on import.
 *
 * Deferring it keeps `import` side-effect free, so a build or a typecheck that
 * never touches the database does not need one to exist. Unlike the previous
 * Postgres client, this cannot be a synchronous Proxy that connects lazily
 * behind the scenes: the Mongo driver's connect step is asynchronous, and every
 * caller here is already inside an async request handler or script, so there is
 * nothing to gain by disguising that.
 */

let client: MongoClient | undefined
let connecting: Promise<MongoClient> | undefined

function connect(): Promise<MongoClient> {
  if (!connecting) {
    const uri = process.env.MONGODB_URI
    if (!uri) throw new Error('Missing MONGODB_URI.')

    client = new MongoClient(uri, {
      maxPoolSize: Number(process.env.DATABASE_POOL_MAX ?? 10),
      // Fail fast rather than letting a request hang on an unreachable cluster.
      serverSelectionTimeoutMS: 10_000,
    })
    connecting = client.connect()
  }
  return connecting
}

/** The store for the default database named in the connection string. */
export async function getDb(): Promise<Store> {
  const connected = await connect()
  return makeStore(connected.db(), connected)
}

/**
 * Runs `fn` inside a MongoDB multi-document transaction, retrying on the
 * transient errors the driver expects a caller to retry.
 *
 * This is the direct replacement for `db.transaction(async (tx) => ...)`: `fn`
 * receives a store bound to the transaction's session, and every read or write
 * it makes must pass that session through explicitly — MongoDB has no ambient
 * transaction the way a Postgres connection does.
 *
 * `session.withTransaction` already retries `TransientTransactionError` (a
 * write conflict with another transaction — exactly what two concurrent
 * `postInvoice` calls produce when they race for the same number-series
 * document) and `UnknownTransactionCommitResult` (a commit whose acknowledgement
 * was lost, not necessarily a failed commit) per the driver's documented retry
 * loop. That retry is what makes takeNextNumber's `findOneAndUpdate` safe under
 * concurrency without an explicit row lock — there is no `FOR UPDATE` in
 * MongoDB; a conflicting writer aborts and tries again instead of blocking.
 *
 * Requires the server to be a replica set (or a sharded cluster) — a standalone
 * `mongod` cannot run transactions at all. `dev-db.mts` and `db/testing.ts` both
 * start a single-node replica set for exactly this reason, and any real
 * deployment (Atlas, a self-hosted replica set) already is one.
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

/** Closes the connection. Used on shutdown so in-flight operations are not cut off. */
export async function closeDb(): Promise<void> {
  if (client) await client.close()
  client = undefined
  connecting = undefined
}

export * from '@/db/collections'
