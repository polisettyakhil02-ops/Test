/**
 * Applies pending migrations and re-applies the ledger guards.
 *
 *   npm run migrate
 *
 * Split out of `setup` so a deploy can run it unattended: `setup` also wants an
 * admin email and password, which a container boot has no way to supply. This
 * touches schema only — no entity, no user, no seed data — and is safe to run
 * on every start, because it records what it has already applied.
 */
import { config as loadEnv } from 'dotenv'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import postgres from 'postgres'
import { ledgerGuardsFile, migrationsDir } from '@/lib/sql-assets'

loadEnv({ path: ['.env.local', '.env'], quiet: true })

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('Set DATABASE_URL before running migrations.')
    process.exit(1)
  }

  const sql = postgres(url, {
    max: 1,
    // Every IF EXISTS / IF NOT EXISTS raises a "... skipping" notice doing its
    // job. Printing those makes a healthy deploy look like it went wrong.
    onnotice: (notice) => {
      if (!notice.message.endsWith(', skipping')) console.warn(notice.message)
    },
  })

  try {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS applied_migrations (
        file       text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    // Databases created before this bookkeeping existed already have the
    // initial schema; record it rather than trying to replay it.
    const [{ bootstrapped }] = await sql<[{ bootstrapped: boolean }]>`
      SELECT to_regclass('public.entities') IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM applied_migrations) AS bootstrapped
    `
    if (bootstrapped) {
      await sql`INSERT INTO applied_migrations (file) VALUES ('0000_init.sql')`
    }

    const applied = new Set(
      (await sql`SELECT file FROM applied_migrations`).map((row) => row.file as string),
    )

    const dir = migrationsDir()
    const pending = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .filter((f) => !applied.has(f))

    if (pending.length === 0) {
      console.log('Migrations already up to date.')
    }

    for (const file of pending) {
      console.log(`Applying ${file}...`)
      // One transaction per migration: a half-applied schema change is the one
      // state there is no good way to recover from by hand.
      await sql.begin(async (tx) => {
        for (const statement of readFileSync(join(dir, file), 'utf8').split('--> statement-breakpoint')) {
          const trimmed = statement.trim()
          if (trimmed) await tx.unsafe(trimmed)
        }
        await tx`INSERT INTO applied_migrations (file) VALUES (${file})`
      })
    }

    // Idempotent by construction, and cheap. Re-applying on every deploy means
    // the guards can never drift behind the code that relies on them.
    console.log('Applying ledger guards...')
    await sql.unsafe(readFileSync(ledgerGuardsFile(), 'utf8'))

    console.log('Database is up to date.')
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((error) => {
  console.error('Migration failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
