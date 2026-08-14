/**
 * Creates (or updates) the admin account. There is no public sign-up in this
 * app, so this is how the first user gets in.
 *
 *   npm run create-admin -- --email you@company.com --password "s3cret" --name "Your Name"
 *
 * Re-running with an existing email resets that user's password.
 */
import 'dotenv/config'
import mongoose from 'mongoose'
import { connectToDatabase } from '../src/lib/mongodb'
import { User, hashPassword } from '../src/models/User'

function getArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  return index !== -1 ? process.argv[index + 1] : undefined
}

async function main() {
  const email = getArg('--email')
  const password = getArg('--password')
  const name = getArg('--name') || 'Admin'

  if (!email || !password) {
    console.error(
      'Usage: npm run create-admin -- --email <email> --password <password> [--name <name>]',
    )
    process.exit(1)
  }

  if (password.length < 8) {
    console.error('Password must be at least 8 characters.')
    process.exit(1)
  }

  await connectToDatabase()

  const passwordHash = await hashPassword(password)

  const user = await User.findOneAndUpdate(
    { email: email.toLowerCase() },
    { $set: { name, passwordHash, role: 'admin' } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  )

  console.log(`Admin ready: ${user.email} (${user.name})`)

  await mongoose.disconnect()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
