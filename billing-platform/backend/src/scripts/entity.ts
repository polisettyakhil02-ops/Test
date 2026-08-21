/**
 * Sets the selling entity's own details.
 *
 *   npm run entity -- --gstin 29AABCU9603R1ZX \
 *                     --legal-name "Acme Consulting Private Limited" \
 *                     --address "4th Floor, 22 MG Road" --address "Bengaluru - 560001" \
 *                     --email billing@acme.test --phone 9876543210 \
 *                     --bank "HDFC 00123456789 · IFSC HDFC0001234"
 *
 * `npm run setup` creates the entity with a name and a state code, which is
 * enough to raise an invoice but not enough to print a compliant one: the GSTIN
 * and a PIN-coded address are what the tax invoice and the e-invoicing payload
 * both require. Run with no flags to see what is currently set.
 */
import { config as loadEnv } from 'dotenv'
import { MongoClient } from 'mongodb'

loadEnv({ path: ['.env.local', '.env'], quiet: true })

function arg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  return index !== -1 ? process.argv[index + 1] : undefined
}

/** Repeatable flags, so a multi-line address stays multi-line. */
function args(flag: string): string[] {
  return process.argv.reduce<string[]>((found, value, index) => {
    if (value === flag && process.argv[index + 1]) found.push(process.argv[index + 1])
    return found
  }, [])
}

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('Set MONGODB_URI in .env first.')
    process.exit(1)
  }

  const client = new MongoClient(uri)

  try {
    await client.connect()
    const entities = client.db().collection('entities')
    const entity = await entities.findOne({})
    if (!entity) {
      console.error('No entity yet. Run `npm run setup` first.')
      process.exit(1)
    }

    const gstin = arg('--gstin')
    const legalName = arg('--legal-name')
    const email = arg('--email')
    const phone = arg('--phone')
    const bank = arg('--bank')
    const stateCode = arg('--state')
    const address = args('--address')

    if (gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z\d][A-Z\d]$/.test(gstin)) {
      console.error(`"${gstin}" is not a GSTIN: 2 digits, 10-character PAN, then 3 more.`)
      process.exit(1)
    }

    // The state code has to agree with the GSTIN's first two digits, or every
    // invoice will pick the wrong side of the CGST/SGST vs IGST split.
    if (gstin && stateCode && gstin.slice(0, 2) !== stateCode) {
      console.error(`GSTIN starts with ${gstin.slice(0, 2)} but --state is ${stateCode}.`)
      process.exit(1)
    }

    const nothingToDo =
      !gstin && !legalName && !email && !phone && !bank && !stateCode && address.length === 0

    if (nothingToDo) {
      console.log(`Name:        ${entity.name}`)
      console.log(`Legal name:  ${entity.legalName || '(not set)'}`)
      console.log(`GSTIN:       ${entity.gstin || '(not set)'}`)
      console.log(`State code:  ${entity.stateCode || '(not set)'}`)
      console.log(`Address:     ${(entity.addressLines as string[]).join(' / ') || '(not set)'}`)
      console.log(`Email:       ${entity.email || '(not set)'}`)
      console.log(`Phone:       ${entity.phone || '(not set)'}`)
      console.log(`Bank:        ${entity.bankDetails || '(not set)'}`)

      const lines = (entity.addressLines as string[]).join(' ')
      if (!entity.gstin || !/\b\d{6}\b/.test(lines)) {
        console.log('\nA GSTIN and a 6-digit PIN code in the address are needed for e-invoicing.')
      }
      return
    }

    const set: Record<string, unknown> = {}
    if (gstin) set.gstin = gstin
    if (legalName) set.legalName = legalName
    if (stateCode) set.stateCode = stateCode
    if (email) set.email = email
    if (phone) set.phone = phone
    if (bank) set.bankDetails = bank
    if (address.length) set.addressLines = address

    await entities.updateOne({ _id: entity._id }, { $set: set })
    console.log('Entity updated. Re-run with no flags to see the result.')
  } finally {
    await client.close()
  }
}

main()
