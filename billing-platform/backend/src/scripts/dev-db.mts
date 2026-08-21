/**
 * A real MongoDB replica set on localhost, for local development when you do
 * not have one to hand (and do not want to reach for Atlas or Docker just to
 * try the app out).
 *
 * A single-node replica set rather than a standalone server, on purpose: this
 * application posts every document inside a multi-document transaction, and
 * MongoDB refuses transactions on a standalone `mongod` outright. One node is
 * enough to satisfy that requirement for local work; it is not a substitute for
 * a real replica set (or Atlas) in production, where you want more than one
 * node for the durability a replica set actually buys you.
 *
 *   npm run dev:db
 *
 * Then point MONGODB_URI in .env at whatever it prints — normally
 * mongodb://127.0.0.1:27017/billing?replicaSet=rs0.
 */
import { mkdirSync } from 'node:fs'
import { MongoMemoryReplSet } from 'mongodb-memory-server'

const dbPath = process.env.DEV_DB_DIR || './.devdb'
const port = Number(process.env.DEV_DB_PORT || 27017)

// mongod expects --dbpath to already exist; unlike a tmp dir, this one is
// meant to persist between runs, so create it once rather than each time.
mkdirSync(dbPath, { recursive: true })

const replSet = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: 'wiredTiger' },
  instanceOpts: [{ port, dbPath, storageEngine: 'wiredTiger' }],
})

const uri = `${replSet.getUri('billing')}`
console.log(`MongoDB listening on 127.0.0.1:${port} (data in ${dbPath})`)
console.log(`MONGODB_URI=${uri}`)

const shutdown = async () => {
  await replSet.stop()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
