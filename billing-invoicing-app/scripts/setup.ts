/**
 * One-time setup: apply migrations, create the entity, chart of accounts,
 * periods, number series and the first admin user.
 *
 *   npm run setup -- --email you@company.com --password "s3cret" --company "Acme Pvt Ltd" --state 29
 *
 * Safe to re-run: it will not duplicate the entity, and re-running with an
 * existing email resets that user's password.
 */
import { config as loadEnv } from 'dotenv'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import postgres from 'postgres'
import bcrypt from 'bcryptjs'

// Next.js reads .env.local, so this script must too -- dotenv's default only
// looks at .env, which would leave DATABASE_URL undefined for everyone.
loadEnv({ path: ['.env.local', '.env'], quiet: true })

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i !== -1 ? process.argv[i + 1] : undefined
}

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('Set DATABASE_URL in .env.local first.')
    process.exit(1)
  }

  const email = arg('--email')
  const password = arg('--password')
  const company = arg('--company') ?? 'My Company'
  const stateCode = arg('--state') ?? '29'
  const name = arg('--name') ?? 'Admin'

  if (!email || !password) {
    console.error('Usage: npm run setup -- --email <email> --password <password> [--company <name>] [--state <code>]')
    process.exit(1)
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.')
    process.exit(1)
  }

  const sql = postgres(url, {
    max: 1,
    // This script is written to be re-runnable, so every IF EXISTS / IF NOT
    // EXISTS raises a "... skipping" notice doing exactly its job. Printing
    // those makes a healthy run look like it went wrong. Any other notice --
    // the ones worth reading -- still gets through.
    onnotice: (notice) => {
      if (!notice.message.endsWith(', skipping')) console.warn(notice.message)
    },
  })

  try {
    // Which migrations this database has already seen. Without this, a second
    // run would replay 0000_init and fail on the first CREATE TABLE -- and
    // "safe to re-run" has to survive the arrival of a second migration.
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS applied_migrations (
        file       text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    // One-time backfill for databases created before this bookkeeping existed:
    // if the schema is already there but nothing is recorded, the initial
    // migration is what put it there.
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

    const dir = join(process.cwd(), 'src/db/migrations')
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .filter((f) => !applied.has(f))

    if (files.length === 0) {
      console.log('Migrations already up to date.')
    }

    for (const file of files) {
      console.log(`Applying ${file}...`)
      const content = readFileSync(join(dir, file), 'utf8')
      // One transaction per migration: a half-applied schema change is the one
      // state there is no good way to recover from by hand.
      await sql.begin(async (tx) => {
        for (const statement of content.split('--> statement-breakpoint')) {
          const trimmed = statement.trim()
          if (trimmed) await tx.unsafe(trimmed)
        }
        await tx`INSERT INTO applied_migrations (file) VALUES (${file})`
      })
    }

    console.log('Applying ledger guards...')
    await sql.unsafe(readFileSync(join(process.cwd(), 'src/db/ledger-guards.sql'), 'utf8'))

    const existing = await sql`SELECT id FROM entities LIMIT 1`
    let entityId: string

    if (existing.length > 0) {
      entityId = existing[0].id
      console.log('Entity already exists; leaving it alone.')
    } else {
      const [entity] = await sql`
        INSERT INTO entities (name, legal_name, state_code)
        VALUES (${company}, ${company}, ${stateCode})
        RETURNING id
      `
      entityId = entity.id
      console.log(`Created entity: ${company}`)

      const accounts: Array<[string, string, string]> = [
        ['1000', 'Bank', 'asset'],
        ['1100', 'Accounts Receivable', 'asset'],
        ['2000', 'Accounts Payable', 'liability'],
        ['2200', 'GST Output Payable', 'liability'],
        ['3000', 'Owner Equity', 'equity'],
        ['4000', 'Sales', 'income'],
        ['4100', 'Services', 'income'],
        ['5000', 'General Expenses', 'expense'],
      ]
      for (const [code, accName, type] of accounts) {
        await sql`
          INSERT INTO accounts (entity_id, code, name, type)
          VALUES (${entityId}, ${code}, ${accName}, ${type}::account_type)
        `
      }
      console.log(`Created ${accounts.length} accounts`)

      // Twelve monthly periods for the current Indian fiscal year.
      const now = new Date()
      const fyStart = now.getUTCMonth() + 1 >= 4 ? now.getUTCFullYear() : now.getUTCFullYear() - 1
      for (let i = 0; i < 12; i += 1) {
        const month = ((3 + i) % 12) + 1
        const year = fyStart + (3 + i >= 12 ? 1 : 0)
        const start = `${year}-${String(month).padStart(2, '0')}-01`
        const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
        const end = `${year}-${String(month).padStart(2, '0')}-${endDay}`
        const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en', {
          month: 'short',
          timeZone: 'UTC',
        })
        await sql`
          INSERT INTO accounting_periods (entity_id, name, starts_on, ends_on)
          VALUES (${entityId}, ${`${label} ${year}`}, ${start}, ${end})
        `
      }
      console.log('Created 12 monthly periods')

      const fy = `${fyStart}-${String((fyStart + 1) % 100).padStart(2, '0')}`
      for (const [docType, prefix] of [
        ['invoice', 'INV-'],
        ['credit_note', 'CRN-'],
        ['payment', 'PAY-'],
      ] as const) {
        await sql`
          INSERT INTO number_series (entity_id, doc_type, fiscal_year, prefix)
          VALUES (${entityId}, ${docType}::doc_type, ${fy}, ${prefix})
        `
      }
      console.log(`Created number series for ${fy}`)
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const [user] = await sql`
      INSERT INTO users (email, name, password_hash, role)
      VALUES (${email.toLowerCase()}, ${name}, ${passwordHash}, 'admin')
      ON CONFLICT (lower(email)) DO UPDATE
        SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name
      RETURNING email
    `
    console.log(`Admin ready: ${user.email}`)
    console.log('\nSetup complete. Run `npm run dev` and sign in.')
  } finally {
    await sql.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
