/**
 * Where the migration SQL lives at runtime.
 *
 * The scripts run two ways: with tsx straight from `src/` during development,
 * and as bundled CommonJS from `dist/` inside the container, where `src/` is not
 * shipped. Resolving by "whichever exists" keeps a single code path instead of
 * a build-time flag that only one of the two ever exercises.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

function resolve(relative: string): string {
  const candidates = [
    join(process.cwd(), 'src/db', relative),
    join(process.cwd(), 'dist/db', relative),
  ]
  const found = candidates.find((path) => existsSync(path))
  if (found) return found

  throw new Error(
    `Could not find ${relative}. Looked in:\n  ${candidates.join('\n  ')}\n` +
      'Run this from the backend directory (or the image WORKDIR).',
  )
}

export const migrationsDir = () => resolve('migrations')
export const ledgerGuardsFile = () => resolve('ledger-guards.sql')
