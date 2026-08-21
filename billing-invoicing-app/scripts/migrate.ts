/**
 * Ensures every index and document validator the ledger depends on.
 *
 *   npm run migrate
 *
 * Split out of `setup` so a deploy can run it unattended: `setup` also wants an
 * admin email and password, which a container boot has no way to supply. This
 * touches indexes and validators only — no entity, no user, no seed data — and
 * is safe to run on every start.
 *
 * There is no schema to migrate in the SQL sense: a MongoDB collection accepts
 * any document until a validator says otherwise, so there are no numbered
 * migration files and no `applied_migrations` table to maintain here.
 * `ensureIndexes` (db/indexes.ts) creates each index and validator with
 * `createIndex` / `createCollection`-or-`collMod`, all of which are idempotent
 * on their own — running this twice in a row does exactly the same thing both
 * times, which is what "safe to run on every deploy" actually requires.
 */
import { config as loadEnv } from 'dotenv'
import { MongoClient } from 'mongodb'
import { ensureIndexes } from '@/db/indexes'

loadEnv({ path: ['.env.local', '.env'], quiet: true })

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('Set MONGODB_URI before running migrations.')
    process.exit(1)
  }

  const client = new MongoClient(uri)
  try {
    await client.connect()
    await ensureIndexes(client.db())
    console.log('Indexes and validators are up to date.')
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error('Migration failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
