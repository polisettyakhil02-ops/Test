/**
 * Drains the transactional outbox.
 *
 * Posting writes an event row in the same transaction as the ledger entry; this
 * is the other half of the pattern, the part that actually delivers. Run it as
 * a service (`npm run outbox`) or once from cron (`npm run outbox -- --once`).
 *
 * Safe to run more than one of: rows are claimed with FOR UPDATE SKIP LOCKED,
 * so two workers share the queue rather than double-delivering the same event
 * in the same instant.
 */
import { config as loadEnv } from 'dotenv'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '@/db/schema'
import { drainOutbox } from '@/domain/webhooks'

loadEnv({ path: ['.env.local', '.env'], quiet: true })

// Everything lives inside main(): a top-level await here would make this an ESM
// module, which the .ts loader refuses to require.
async function main() {
  const endpoint = process.env.WEBHOOK_ENDPOINT?.trim()
  const secret = process.env.WEBHOOK_SECRET?.trim()

  if (!endpoint || !secret) {
    console.error(
      'Set WEBHOOK_ENDPOINT and WEBHOOK_SECRET in .env before running the worker.',
    )
    process.exit(1)
  }

  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('Missing DATABASE_URL.')
    process.exit(1)
  }

  const once = process.argv.includes('--once')
  const intervalMs = Number(process.env.OUTBOX_INTERVAL_MS ?? 5000)

  const client = postgres(url, { max: Number(process.env.DATABASE_POOL_MAX ?? 2) })
  const db = drizzle(client, { schema })

  let stopping = false

  const tick = async () => {
    const result = await drainOutbox(db, { endpoint, secret })

    if (result.attempted > 0) {
      console.log(
        `attempted ${result.attempted}, delivered ${result.delivered}, failed ${result.failed}`,
      )
      for (const failure of result.failures) {
        console.warn(`  ${failure.id}: ${failure.error}`)
      }
    }

    return result
  }

  const shutdown = async () => {
    stopping = true
    await client.end({ timeout: 5 })
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  if (once) {
    const result = await tick()
    if (result.attempted === 0) console.log('Nothing was due.')
    await client.end({ timeout: 5 })
    return
  }

  console.log(`Draining outbox to ${endpoint} every ${intervalMs}ms. Ctrl-C to stop.`)

  while (!stopping) {
    try {
      await tick()
    } catch (error) {
      // A worker that dies on a transient database blip is worse than one that
      // logs and tries again.
      console.error('drain failed:', error instanceof Error ? error.message : error)
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

main()
