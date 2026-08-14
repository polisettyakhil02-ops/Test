/**
 * Offline checks for the pure helpers behind the Clients and Items screens:
 * form validation, search-query handling, and document -> DTO mapping.
 * No MongoDB connection required.
 *
 *   npm run verify-lib
 */
import assert from 'node:assert/strict'
import { Types } from 'mongoose'
import { clientSchema, itemSchema, fieldErrors } from '../src/lib/validation'
import { containsRegex, readQuery } from '../src/lib/search'
import { toClientDTO, toItemDTO, formatAddress, formatCurrency } from '../src/lib/dto'

let passed = 0

async function check(label: string, fn: () => void | Promise<void>) {
  await fn()
  passed += 1
  console.log(`  ok  ${label}`)
}

const emptyAddress = {
  line1: '',
  line2: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
}

async function main() {
  console.log('\nClient form validation')

  await check('trims the name and defaults country to India', () => {
    const result = clientSchema.safeParse({
      name: '  Acme Ltd  ',
      billingAddress: {},
    })
    assert.ok(result.success)
    assert.equal(result.data.name, 'Acme Ltd')
    assert.equal(result.data.billingAddress.country, 'India')
  })

  await check('rejects a blank name', () => {
    const result = clientSchema.safeParse({ name: '   ', billingAddress: {} })
    assert.ok(!result.success)
    assert.equal(fieldErrors(result.error).name, 'Name is required')
  })

  await check('accepts a blank email but rejects a malformed one', () => {
    const blank = clientSchema.safeParse({ name: 'A', email: '', billingAddress: {} })
    assert.ok(blank.success, 'an untouched optional email must not fail validation')

    const bad = clientSchema.safeParse({ name: 'A', email: 'nope', billingAddress: {} })
    assert.ok(!bad.success)
    assert.match(fieldErrors(bad.error).email, /valid email/)
  })

  console.log('\nItem form validation')

  await check('coerces numeric strings from the HTML form', () => {
    const result = itemSchema.safeParse({
      name: 'Consulting',
      price: '1500.50',
      taxRate: '18',
    })
    assert.ok(result.success)
    assert.equal(result.data.price, 1500.5)
    assert.equal(result.data.taxRate, 18)
    assert.equal(result.data.unit, 'unit')
  })

  await check('rejects a non-numeric price with a readable message', () => {
    const result = itemSchema.safeParse({ name: 'X', price: 'abc', taxRate: '5' })
    assert.ok(!result.success)
    // Coercion turns "abc" into NaN rather than failing, so .finite() is what
    // catches it -- and the message must be the custom one, not zod's default.
    assert.equal(fieldErrors(result.error).price, 'Enter a valid number')
  })

  await check('rejects a negative price and a tax rate above 100', () => {
    const negative = itemSchema.safeParse({ name: 'X', price: '-1', taxRate: '5' })
    assert.ok(!negative.success)
    assert.equal(fieldErrors(negative.error).price, 'Cannot be negative')

    const highTax = itemSchema.safeParse({ name: 'X', price: '1', taxRate: '150' })
    assert.ok(!highTax.success)
    assert.equal(fieldErrors(highTax.error).taxRate, 'Cannot exceed 100')
  })

  console.log('\nSearch handling')

  await check('escapes regex metacharacters instead of throwing', () => {
    // An unescaped "(" is invalid regex syntax and would 500 the list page.
    assert.doesNotThrow(() => containsRegex('('))
    assert.doesNotThrow(() => containsRegex('a[b'))
    assert.doesNotThrow(() => containsRegex('*'))
  })

  await check('treats metacharacters as literal text', () => {
    assert.ok(containsRegex('a.c').test('a.c'))
    // Unescaped, "a.c" would also match "abc" -- that would be wrong.
    assert.ok(!containsRegex('a.c').test('abc'))
    assert.ok(containsRegex('Acme (India)').test('acme (india) pvt ltd'))
  })

  await check('matches case-insensitively and as a substring', () => {
    assert.ok(containsRegex('acme').test('ACME Pvt Ltd'))
    assert.ok(containsRegex('cme p').test('ACME Pvt Ltd'))
  })

  await check('readQuery normalizes string, array and missing params', () => {
    assert.equal(readQuery('  acme '), 'acme')
    assert.equal(readQuery(undefined), '')
    assert.equal(readQuery(['a', 'b']), '')
  })

  console.log('\nDTO mapping')

  await check('toClientDTO converts ObjectId and Date to plain JSON values', () => {
    const id = new Types.ObjectId()
    const created = new Date('2026-01-15T10:30:00.000Z')

    const dto = toClientDTO({
      _id: id,
      name: 'Acme',
      email: 'a@b.c',
      phone: '123',
      gstin: '29ABCDE1234F1Z5',
      notes: '',
      billingAddress: { ...emptyAddress, city: 'Bengaluru', country: 'India' },
      createdAt: created,
      updatedAt: created,
    } as unknown as Parameters<typeof toClientDTO>[0])

    assert.equal(dto.id, id.toString())
    assert.equal(typeof dto.id, 'string')
    assert.equal(dto.createdAt, '2026-01-15T10:30:00.000Z')
    assert.equal(dto.billingAddress.city, 'Bengaluru')
    // Must survive the server -> client boundary.
    assert.doesNotThrow(() => JSON.stringify(dto))
  })

  await check('toItemDTO fills defaults for missing optional fields', () => {
    const id = new Types.ObjectId()

    const dto = toItemDTO({
      _id: id,
      name: 'Consulting',
      price: 1000,
      taxRate: 18,
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
      updatedAt: new Date('2026-02-01T00:00:00.000Z'),
    } as unknown as Parameters<typeof toItemDTO>[0])

    assert.equal(dto.id, id.toString())
    assert.equal(dto.description, '')
    assert.equal(dto.hsnSac, '')
    assert.equal(dto.unit, 'unit')
  })

  console.log('\nFormatting')

  await check('formatAddress omits blank parts', () => {
    assert.equal(
      formatAddress({
        ...emptyAddress,
        line1: '12 MG Road',
        city: 'Bengaluru',
        country: 'India',
      }),
      '12 MG Road, Bengaluru, India',
    )
    assert.equal(formatAddress(emptyAddress), '')
  })

  await check('formatCurrency renders two decimals', () => {
    const formatted = formatCurrency(1500.5)
    assert.match(formatted, /1,500\.50/)
    assert.match(formatCurrency(0), /0\.00/)
  })

  console.log(`\n${passed} checks passed\n`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
