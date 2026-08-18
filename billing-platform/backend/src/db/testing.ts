import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import * as schema from '@/db/schema'

export type TestDb = ReturnType<typeof drizzle<typeof schema>> & { $raw: PGlite }

const MIGRATIONS_DIR = join(process.cwd(), 'src/db/migrations')
const GUARDS_SQL = join(process.cwd(), 'src/db/ledger-guards.sql')

/**
 * A real PostgreSQL instance, in-process via WASM. Not a mock and not a
 * different engine -- the same constraint and trigger behaviour production
 * gets, which is the only way the ledger's invariants are actually tested.
 */
export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite()

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    // drizzle-kit separates statements with this marker.
    for (const statement of sql.split('--> statement-breakpoint')) {
      const trimmed = statement.trim()
      if (trimmed) await client.exec(trimmed)
    }
  }

  await client.exec(readFileSync(GUARDS_SQL, 'utf8'))

  const db = drizzle(client, { schema }) as TestDb
  db.$raw = client
  return db
}
