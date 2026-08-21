import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { MongoClient } from 'mongodb'
import { ensureIndexes } from '@/db/indexes'
import { makeStore, type Store } from '@/db/collections'

export type TestDb = Store & { stop: () => Promise<void> }

/**
 * A real MongoDB instance, in-process. Not a mock and not a different engine —
 * the same server, the same validators, the same transaction semantics
 * production gets, which is the only way the ledger's invariants are actually
 * tested.
 *
 * A single-node replica set rather than a standalone server: transactions do
 * not exist on a standalone `mongod` at all, and this application posts
 * everything through one, so a standalone instance could not run these tests
 * to begin with.
 *
 * `mongodb-memory-server` downloads a real `mongod` binary the first time it
 * runs and caches it — the same shape of thing PGlite did for Postgres, except
 * the binary is fetched rather than bundled as WASM. That means the very first
 * `npm test` on a machine needs a working connection to
 * https://fastdl.mongodb.org; every run after that is instant.
 */
export async function createTestDb(): Promise<TestDb> {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } })
  const client = new MongoClient(replSet.getUri())
  await client.connect()

  const db = client.db('test')
  await ensureIndexes(db)

  const store = makeStore(db, client)
  return {
    ...store,
    stop: async () => {
      await client.close()
      await replSet.stop()
    },
  }
}
