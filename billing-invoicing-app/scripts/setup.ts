/**
 * One-time setup: ensure indexes, create the entity, chart of accounts,
 * periods, number series and the first admin user.
 *
 *   npm run setup -- --email you@company.com --password "s3cret" --company "Acme Pvt Ltd" --state 29
 *
 * Safe to re-run: it will not duplicate the entity, and re-running with an
 * existing email resets that user's password.
 */
import { config as loadEnv } from 'dotenv'
import { MongoClient } from 'mongodb'
import bcrypt from 'bcryptjs'
import { newId } from '@/db/ids'
import { ensureIndexes } from '@/db/indexes'
import { makeStore } from '@/db/collections'
import { DEFAULT_ACCOUNTS, monthlyPeriods } from '@/domain/seed'
import { fiscalYearOf } from '@/domain/posting'

// .env.local wins over .env when both exist, so a machine-local override
// (a different database, say) does not have to be committed.
loadEnv({ path: ['.env.local', '.env'], quiet: true })

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i !== -1 ? process.argv[i + 1] : undefined
}

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('Set MONGODB_URI in .env.local first.')
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

  const client = new MongoClient(uri)

  try {
    await client.connect()
    const db = client.db()
    await ensureIndexes(db)
    const store = makeStore(db, client)

    let entityId: string
    const existing = await store.entities.findOne({})

    if (existing) {
      entityId = existing._id
      console.log('Entity already exists; leaving it alone.')
    } else {
      const entity = {
        _id: newId(),
        name: company,
        legalName: company,
        gstin: '',
        stateCode,
        addressLines: [],
        email: '',
        phone: '',
        bankDetails: '',
        functionalCurrency: 'INR',
        createdAt: new Date(),
      }
      await store.entities.insertOne(entity)
      entityId = entity._id
      console.log(`Created entity: ${company}`)

      await store.accounts.insertMany(
        DEFAULT_ACCOUNTS.map((account) => ({
          _id: newId(),
          entityId,
          code: account.code,
          name: account.name,
          type: account.type,
          parentId: null,
          isPostable: true,
          isActive: true,
        })),
      )
      console.log(`Created ${DEFAULT_ACCOUNTS.length} accounts`)

      // Twelve monthly periods for the current Indian fiscal year.
      const now = new Date()
      const fyStart = now.getUTCMonth() + 1 >= 4 ? now.getUTCFullYear() : now.getUTCFullYear() - 1
      await store.accountingPeriods.insertMany(
        monthlyPeriods(fyStart).map((p) => ({
          _id: newId(),
          entityId,
          name: p.name,
          startsOn: p.startsOn,
          endsOn: p.endsOn,
          state: 'open' as const,
          closedAt: null,
          closedBy: null,
        })),
      )
      console.log('Created 12 monthly periods')

      const fy = fiscalYearOf(`${fyStart}-04-01`)
      await store.numberSeries.insertMany(
        (
          [
            ['invoice', 'INV-'],
            ['credit_note', 'CRN-'],
            ['payment', 'PAY-'],
          ] as const
        ).map(([docType, prefix]) => ({
          _id: newId(),
          entityId,
          docType,
          fiscalYear: fy,
          prefix,
          padding: 5,
          nextValue: 1,
        })),
      )
      console.log(`Created number series for ${fy}`)
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const normalizedEmail = email.toLowerCase()
    await store.users.updateOne(
      { email: normalizedEmail },
      {
        $set: { name, passwordHash, role: 'admin', isActive: true },
        $setOnInsert: { _id: newId(), email: normalizedEmail, createdAt: new Date() },
      },
      { upsert: true },
    )
    console.log(`Admin ready: ${normalizedEmail}`)
    console.log('\nSetup complete. Run `npm run dev` and sign in.')
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
