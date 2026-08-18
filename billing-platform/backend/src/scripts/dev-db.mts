/**
 * A real PostgreSQL server on localhost:5432, backed by PGlite.
 *
 * Speaks the actual Postgres wire protocol, so the app connects to it exactly
 * as it would to a production instance. Used to exercise the app end to end in
 * environments where a normal PostgreSQL install is not available.
 *
 * One constraint: PGlite is a single WASM instance and serves one connection at
 * a time, so set DATABASE_POOL_MAX=1 when pointing the app at it. A real
 * PostgreSQL server has no such limit -- this is a property of the harness,
 * not of the application.
 */
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

const dataDir = process.env.DEV_DB_DIR || './.devdb'
const port = Number(process.env.DEV_DB_PORT || 5432)

const db = await PGlite.create({ dataDir })
const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' })

await server.start()
console.log(`PGlite listening on 127.0.0.1:${port} (data in ${dataDir})`)

const shutdown = async () => {
  await server.stop()
  await db.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
