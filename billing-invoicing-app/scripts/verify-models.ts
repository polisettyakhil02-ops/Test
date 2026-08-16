/**
 * Offline sanity checks for the Mongoose schemas and the invoice arithmetic.
 * Runs without a MongoDB connection: schema validation and recalculateInvoice
 * are both pure in-memory operations.
 *
 *   npm run verify-models
 */
import assert from 'node:assert/strict'
import { Client } from '../src/models/Client'
import { Item } from '../src/models/Item'
import { User } from '../src/models/User'
import {
  Invoice,
  recalculateInvoice,
  round2,
  derivePaymentStatus,
  taxBreakdown,
  type DiscountType,
  type IInvoiceLineItem,
} from '../src/models/Invoice'
import { Types } from 'mongoose'

/**
 * Builds a fully-formed calc input from just the fields a case cares about, so
 * the checks below exercise the real typed API rather than casting to `any`.
 */
function calc(
  lines: Array<Pick<IInvoiceLineItem, 'quantity' | 'unitPrice' | 'taxRate'>>,
  options: {
    discountType?: DiscountType
    discountValue?: number
    amountPaid?: number
  } = {},
) {
  return recalculateInvoice({
    lineItems: lines.map((line) => ({
      item: null,
      description: 'Line',
      hsnSac: '',
      unit: 'unit',
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxRate: line.taxRate,
      lineSubtotal: 0,
      lineDiscount: 0,
      lineTaxAmount: 0,
      lineTotal: 0,
    })),
    discountType: options.discountType ?? 'fixed',
    discountValue: options.discountValue ?? 0,
    amountPaid: options.amountPaid ?? 0,
  })
}

let passed = 0

async function check(label: string, fn: () => void | Promise<void>) {
  await fn()
  passed += 1
  console.log(`  ok  ${label}`)
}

/** Returns the ValidationError for a document, or null when it validates. */
async function validationErrorOf(doc: {
  validate: () => Promise<void>
}): Promise<{ errors: Record<string, unknown> } | null> {
  try {
    await doc.validate()
    return null
  } catch (error) {
    return error as { errors: Record<string, unknown> }
  }
}

async function main() {
  console.log('\nSchema validation')

  await check('Client requires a name', async () => {
    const err = await validationErrorOf(new Client({}))
    assert.ok(err?.errors.name, 'expected a validation error on name')
  })

  await check('Client defaults country to India and uppercases GSTIN', () => {
    const c = new Client({ name: 'Acme', gstin: '29abcde1234f1z5' })
    assert.equal(c.billingAddress.country, 'India')
    assert.equal(c.gstin, '29ABCDE1234F1Z5')
  })

  await check('Item rejects a negative price', async () => {
    const err = await validationErrorOf(new Item({ name: 'Consulting', price: -1 }))
    assert.ok(err?.errors.price)
  })

  await check('Item rejects a tax rate above 100', async () => {
    const err = await validationErrorOf(
      new Item({ name: 'Consulting', price: 10, taxRate: 120 }),
    )
    assert.ok(err?.errors.taxRate)
  })

  await check('User rejects a malformed email', async () => {
    const err = await validationErrorOf(
      new User({ name: 'A', email: 'nope', passwordHash: 'x' }),
    )
    assert.ok(err?.errors.email)
  })

  await check('User lowercases email', () => {
    const u = new User({ name: 'A', email: 'Admin@Example.COM', passwordHash: 'x' })
    assert.equal(u.email, 'admin@example.com')
  })

  await check('Invoice requires a client', async () => {
    // invoiceNumber is preset so the pre-validate hook skips the DB-backed
    // counter -- this check stays offline.
    const err = await validationErrorOf(new Invoice({ invoiceNumber: 'INV-TEST' }))
    assert.ok(err?.errors.client)
  })

  console.log('\nInvoice arithmetic')

  await check('no discount: subtotal, tax and total', () => {
    const inv = calc([
      { quantity: 2, unitPrice: 100, taxRate: 18 },
      { quantity: 1, unitPrice: 50, taxRate: 5 },
    ])

    assert.equal(inv.subtotal, 250)
    assert.equal(inv.taxAmount, round2(200 * 0.18 + 50 * 0.05)) // 36 + 2.5
    assert.equal(inv.taxAmount, 38.5)
    assert.equal(inv.total, 288.5)
    assert.equal(inv.amountDue, 288.5)
  })

  await check('percentage discount is taxed on the post-discount amount', () => {
    const inv = calc([{ quantity: 1, unitPrice: 1000, taxRate: 18 }], {
      discountType: 'percentage',
      discountValue: 10,
    })

    assert.equal(inv.subtotal, 1000)
    assert.equal(inv.discountAmount, 100)
    // 18% of 900, not of 1000
    assert.equal(inv.taxAmount, 162)
    assert.equal(inv.total, 1062)
  })

  await check('invoice-level discount is apportioned across lines exactly', () => {
    const inv = calc(
      [
        { quantity: 1, unitPrice: 33.33, taxRate: 18 },
        { quantity: 1, unitPrice: 33.33, taxRate: 18 },
        { quantity: 1, unitPrice: 33.34, taxRate: 18 },
      ],
      { discountValue: 10 },
    )

    const allocated = round2(
      inv.lineItems.reduce((sum, line) => sum + line.lineDiscount, 0),
    )
    // The rounding remainder must land on the last line, never vanish.
    assert.equal(allocated, inv.discountAmount)
    assert.equal(allocated, 10)
  })

  await check('discount is clamped to the subtotal, never negative total', () => {
    const inv = calc([{ quantity: 1, unitPrice: 100, taxRate: 0 }], {
      discountValue: 500,
    })

    assert.equal(inv.discountAmount, 100)
    assert.equal(inv.total, 0)
  })

  await check('amountDue subtracts payments', () => {
    const inv = calc([{ quantity: 1, unitPrice: 100, taxRate: 0 }], {
      amountPaid: 40,
    })

    assert.equal(inv.total, 100)
    assert.equal(inv.amountDue, 60)
  })

  await check('float drift is rounded away (0.1 + 0.2 case)', () => {
    const inv = calc([
      { quantity: 3, unitPrice: 0.1, taxRate: 0 },
      { quantity: 1, unitPrice: 0.2, taxRate: 0 },
    ])

    assert.equal(inv.subtotal, 0.5)
    assert.equal(inv.total, 0.5)
  })

  await check('an invoice document carries line snapshots through recalculation', () => {
    const doc = new Invoice({
      client: new Types.ObjectId(),
      lineItems: [
        {
          description: 'Design retainer',
          hsnSac: '998314',
          quantity: 2,
          unitPrice: 500,
          taxRate: 18,
        },
      ],
    })

    recalculateInvoice(doc)

    assert.equal(doc.lineItems[0].lineSubtotal, 1000)
    assert.equal(doc.lineItems[0].lineTaxAmount, 180)
    assert.equal(doc.lineItems[0].lineTotal, 1180)
    assert.equal(doc.total, 1180)
    assert.equal(doc.lineItems[0].description, 'Design retainer')
  })

  console.log('\nPayment status derivation')

  await check('draft and cancelled are never overridden', () => {
    assert.equal(derivePaymentStatus('draft', 1000, 1000, null), 'draft')
    assert.equal(derivePaymentStatus('cancelled', 1000, 0, null), 'cancelled')
  })

  await check('full payment becomes paid', () => {
    assert.equal(derivePaymentStatus('sent', 1000, 1000, null), 'paid')
    // Overpayment still counts as paid, not partially paid.
    assert.equal(derivePaymentStatus('sent', 1000, 1200, null), 'paid')
  })

  await check('partial payment becomes partially_paid', () => {
    assert.equal(derivePaymentStatus('sent', 1000, 400, null), 'partially_paid')
  })

  await check('unpaid past the due date becomes overdue', () => {
    const now = new Date('2026-08-16T00:00:00.000Z')
    const past = new Date('2026-08-01T00:00:00.000Z')
    const future = new Date('2026-09-01T00:00:00.000Z')

    assert.equal(derivePaymentStatus('sent', 1000, 0, past, now), 'overdue')
    assert.equal(derivePaymentStatus('sent', 1000, 0, future, now), 'sent')
    assert.equal(derivePaymentStatus('sent', 1000, 0, null, now), 'sent')
  })

  await check('a zero-total invoice is not silently marked paid', () => {
    // 0 >= 0 would be true, so an empty invoice would otherwise read as paid.
    assert.equal(derivePaymentStatus('sent', 0, 0, null), 'sent')
  })

  console.log('\nTax breakdown')

  await check('groups tax by rate and sorts ascending', () => {
    const rows = taxBreakdown([
      { taxRate: 18, lineSubtotal: 1000, lineDiscount: 0, lineTaxAmount: 180 },
      { taxRate: 5, lineSubtotal: 200, lineDiscount: 0, lineTaxAmount: 10 },
      { taxRate: 18, lineSubtotal: 500, lineDiscount: 0, lineTaxAmount: 90 },
    ])

    assert.equal(rows.length, 2)
    assert.deepEqual(rows[0], { rate: 5, taxable: 200, tax: 10 })
    assert.deepEqual(rows[1], { rate: 18, taxable: 1500, tax: 270 })
  })

  await check('taxable amount is net of the apportioned discount', () => {
    const rows = taxBreakdown([
      { taxRate: 18, lineSubtotal: 1000, lineDiscount: 100, lineTaxAmount: 162 },
    ])

    assert.equal(rows[0].taxable, 900)
    assert.equal(rows[0].tax, 162)
  })

  console.log(`\n${passed} checks passed\n`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
