import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import { createTestDb, type TestDb } from '@/db/testing'
import { withTransaction } from '@/db/client'
import { newId } from '@/db/ids'
import { seedEntity } from '@/domain/seed'
import { buildDocumentLines, postInvoice, postPayment, reverseDocument } from '@/domain/posting'
import { priceDocument } from '@/domain/pricing'
import { partyBalanceMinor } from '@/domain/reports'
import { customerStatement, statementToCsv } from '@/domain/statements'

/**
 * A statement is the customer's receivable account read off the ledger. The
 * property that matters is that it cannot disagree with the books, so these
 * tests check it against the same figures the trial balance is built from.
 */

let db: TestDb
let entityId: string
let partyId: string
let otherPartyId: string

const SNAPSHOT = { name: 'Globex', email: '', phone: '', gstin: '', stateCode: '29', address: '' }

async function invoiceFor(party: string, options: { total: number; issueDate: string; dueDate?: string }) {
  const priced = priceDocument({
    lines: [{ description: 'Consulting', quantity: '1', unitPriceMinor: options.total, taxRatePercent: '0' }],
    discountType: 'fixed',
    discountValue: '0',
    supplyKind: 'intra_state',
  })

  const id = newId()
  const now = new Date()
  await db.documents.insertOne({
    _id: id,
    entityId,
    docType: 'invoice',
    docNumber: null,
    status: 'draft',
    partyId: party,
    partySnapshot: SNAPSHOT,
    issueDate: options.issueDate,
    dueDate: options.dueDate ?? null,
    currency: 'INR',
    fxRate: '1',
    subtotalMinor: priced.subtotalMinor,
    discountMinor: 0,
    taxMinor: priced.taxMinor,
    totalMinor: priced.totalMinor,
    allocatedMinor: 0,
    discountType: 'fixed',
    discountValue: '0',
    supplyKind: 'intra_state',
    placeOfSupply: '',
    correctsDocumentId: null,
    notes: '',
    terms: '',
    irn: null,
    ackNo: null,
    ackDate: null,
    signedQrCode: null,
    postedAt: null,
    postedBy: null,
    voidedAt: null,
    lines: buildDocumentLines([
      {
        lineNo: 1,
        description: 'Consulting',
        hsnSac: '',
        unit: 'unit',
        quantity: '1',
        unitPriceMinor: options.total,
        taxRatePercent: '0',
        ...priced.lines[0],
      },
    ]),
    createdAt: now,
    updatedAt: now,
  })

  const posted = await withTransaction(db, (tx) => postInvoice(tx, id))
  return { id, number: posted.number }
}

async function paymentFor(party: string, options: { amount: number; issueDate: string; against: string }) {
  const id = newId()
  const now = new Date()
  await db.documents.insertOne({
    _id: id,
    entityId,
    docType: 'payment',
    docNumber: null,
    status: 'draft',
    partyId: party,
    partySnapshot: SNAPSHOT,
    issueDate: options.issueDate,
    dueDate: null,
    currency: 'INR',
    fxRate: '1',
    subtotalMinor: options.amount,
    discountMinor: 0,
    taxMinor: 0,
    totalMinor: options.amount,
    allocatedMinor: 0,
    discountType: 'fixed',
    discountValue: '0',
    supplyKind: 'exempt',
    placeOfSupply: '',
    correctsDocumentId: null,
    notes: '',
    terms: '',
    irn: null,
    ackNo: null,
    ackDate: null,
    signedQrCode: null,
    postedAt: null,
    postedBy: null,
    voidedAt: null,
    lines: [],
    createdAt: now,
    updatedAt: now,
  })

  await withTransaction(db, (tx) => postPayment(tx, id, [{ documentId: options.against, amountMinor: options.amount }]))
  return id
}

async function makeParty(name: string) {
  const id = newId()
  await db.parties.insertOne({
    _id: id,
    entityId,
    name,
    isCustomer: true,
    isVendor: false,
    email: '',
    phone: '',
    gstin: '',
    stateCode: '29',
    billingAddress: { line1: '', line2: '', city: '', state: '', postalCode: '', country: 'India' },
    notes: '',
    isActive: true,
    createdAt: new Date(),
  })
  return id
}

before(async () => {
  db = await createTestDb()
  const entity = await seedEntity(db, { name: 'Acme Consulting', stateCode: '29', startYear: 2026 })
  entityId = entity._id

  partyId = await makeParty('Globex')
  otherPartyId = await makeParty('Initech')

  const may = await invoiceFor(partyId, { total: 100_00, issueDate: '2026-05-10' })
  await paymentFor(partyId, { amount: 40_00, issueDate: '2026-05-20', against: may.id })

  const august = await invoiceFor(partyId, { total: 250_00, issueDate: '2026-08-05' })
  await paymentFor(partyId, { amount: 100_00, issueDate: '2026-08-20', against: august.id })

  // Another customer, to prove the statement is scoped to one party.
  await invoiceFor(otherPartyId, { total: 999_00, issueDate: '2026-08-06' })
})

describe('customer statement', () => {
  test('the opening balance is everything before the period', async () => {
    const statement = await customerStatement(db, entityId, partyId, { from: '2026-08-01', to: '2026-08-31' })
    // May: charged 100.00, paid 40.00.
    assert.equal(statement.openingMinor, 60_00)
  })

  test('the closing balance equals the ledger balance for that party', async () => {
    const statement = await customerStatement(db, entityId, partyId, { from: '2026-01-01', to: '2026-12-31' })

    const fromLedger = await partyBalanceMinor(db, entityId, partyId)
    assert.equal(statement.closingMinor, fromLedger)
    assert.equal(statement.closingMinor, 210_00)
  })

  test('opening + charges - payments = closing, on any window', async () => {
    const statement = await customerStatement(db, entityId, partyId, { from: '2026-08-01', to: '2026-08-31' })
    assert.equal(statement.openingMinor + statement.chargedMinor - statement.settledMinor, statement.closingMinor)
  })

  test('the running balance on the last row is the closing balance', async () => {
    const statement = await customerStatement(db, entityId, partyId, { from: '2026-08-01', to: '2026-08-31' })
    assert.equal(statement.rows.at(-1)?.balanceMinor, statement.closingMinor)
  })

  test('rows carry the document number and are in date order', async () => {
    const statement = await customerStatement(db, entityId, partyId, { from: '2026-08-01', to: '2026-08-31' })

    assert.equal(statement.rows.length, 2)
    assert.equal(statement.rows[0].debitMinor, 250_00)
    assert.equal(statement.rows[0].docNumber, 'INV-00002')
    assert.equal(statement.rows[1].creditMinor, 100_00)
    assert.equal(statement.rows[1].docNumber, 'PAY-00002')

    const dates = statement.rows.map((row) => row.date)
    assert.deepEqual([...dates].sort(), dates)
  })

  test("another customer's documents never appear", async () => {
    const statement = await customerStatement(db, entityId, partyId, { from: '2026-01-01', to: '2026-12-31' })
    assert.equal(statement.rows.some((row) => row.debitMinor === 999_00), false)
  })

  test('a period with no movement still reports the right balances', async () => {
    const statement = await customerStatement(db, entityId, partyId, { from: '2026-06-01', to: '2026-06-30' })
    assert.equal(statement.rows.length, 0)
    assert.equal(statement.openingMinor, 60_00)
    assert.equal(statement.closingMinor, 60_00)
  })

  test('voiding an invoice shows up as a movement, not as a deletion', async () => {
    const doomed = await invoiceFor(otherPartyId, { total: 500_00, issueDate: '2026-09-10' })
    await withTransaction(db, (tx) => reverseDocument(tx, doomed.id))

    const statement = await customerStatement(db, entityId, otherPartyId, { from: '2026-09-01', to: '2026-09-30' })

    // Both the original charge and its reversal are on the statement, and they
    // net to nothing -- the ledger records that it happened and was undone.
    assert.equal(statement.rows.length, 2)
    assert.equal(statement.chargedMinor, 500_00)
    assert.equal(statement.settledMinor, 500_00)
    assert.equal(statement.closingMinor, statement.openingMinor)

    const doc = await db.documents.findOne({ _id: doomed.id })
    assert.equal(doc?.status, 'voided')
  })
})

describe('statement CSV', () => {
  test('carries the opening and closing balances as their own rows', async () => {
    const statement = await customerStatement(db, entityId, partyId, { from: '2026-08-01', to: '2026-08-31' })
    const csv = statementToCsv(statement, 'Globex')

    assert.match(csv, /Opening balance,,,60\.00/)
    assert.match(csv, /Closing balance,,,210\.00/)
    assert.match(csv, /INV-00002/)
  })

  test('a comma in the customer name cannot break the layout', async () => {
    const statement = await customerStatement(db, entityId, partyId, { from: '2026-08-01', to: '2026-08-31' })
    assert.match(statementToCsv(statement, 'Globex, Inc.'), /"Globex, Inc\."/)
  })
})
