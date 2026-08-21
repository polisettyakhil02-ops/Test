import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import { createTestDb, type TestDb } from '@/db/testing'
import { withTransaction } from '@/db/client'
import { newId } from '@/db/ids'
import type { DocumentDoc, DocumentLine } from '@/db/collections'
import { seedEntity } from '@/domain/seed'
import {
  PostingError,
  buildDocumentLines,
  fiscalYearOf,
  openBalanceMinor,
  postInvoice,
  postPayment,
  postJournalEntry,
  reverseDocument,
  takeNextNumber,
} from '@/domain/posting'
import { priceDocument, resolveSupplyKind } from '@/domain/pricing'
import { ageingReport, dashboardTotals, partyBalanceMinor, trialBalance } from '@/domain/reports'

let db: TestDb
let entityId: string
let partyId: string

/** Asserts the rejection is a MongoDB document-validator failure (code 121). */
function rejectsValidation() {
  return (error: unknown) => {
    const code = (error as { code?: number }).code
    assert.equal(code, 121, `expected a document-validator rejection (121), got ${code}`)
    return true
  }
}

function blankDoc(overrides: Partial<DocumentDoc> & { lines: DocumentLine[] }): DocumentDoc {
  return {
    _id: newId(),
    entityId,
    docType: 'invoice',
    docNumber: null,
    status: 'draft',
    partyId,
    partySnapshot: { name: 'Globex', email: '', phone: '', gstin: '', stateCode: '29', address: '' },
    issueDate: '2026-08-05',
    dueDate: '2026-09-05',
    currency: 'INR',
    fxRate: '1',
    subtotalMinor: 0,
    discountMinor: 0,
    taxMinor: 0,
    totalMinor: 0,
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
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

async function makeDraft(options: {
  lines: Array<{ description: string; quantity: string; unitPriceMinor: number; taxRatePercent: string }>
  issueDate?: string
  dueDate?: string | null
  discountType?: 'fixed' | 'percentage'
  discountValue?: string
  supplyKind?: 'intra_state' | 'inter_state'
  docType?: 'invoice' | 'credit_note' | 'payment'
  correctsDocumentId?: string
}) {
  const priced = priceDocument({
    lines: options.lines,
    discountType: options.discountType ?? 'fixed',
    discountValue: options.discountValue ?? '0',
    supplyKind: options.supplyKind ?? 'intra_state',
  })

  const doc = blankDoc({
    docType: options.docType ?? 'invoice',
    issueDate: options.issueDate ?? '2026-08-05',
    dueDate: options.dueDate === undefined ? '2026-09-05' : options.dueDate,
    subtotalMinor: priced.subtotalMinor,
    discountMinor: priced.discountMinor,
    taxMinor: priced.taxMinor,
    totalMinor: priced.totalMinor,
    supplyKind: options.supplyKind ?? 'intra_state',
    correctsDocumentId: options.correctsDocumentId ?? null,
    lines: buildDocumentLines(
      options.lines.map((line, index) => ({
        lineNo: index + 1,
        description: line.description,
        hsnSac: '',
        unit: 'unit',
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        taxRatePercent: line.taxRatePercent,
        ...priced.lines[index],
      })),
    ),
  })

  await db.documents.insertOne(doc)
  return { doc, priced }
}

before(async () => {
  db = await createTestDb()
  const entity = await seedEntity(db, { name: 'Acme Consulting', stateCode: '29', startYear: 2026 })
  entityId = entity._id
  partyId = newId()
  await db.parties.insertOne({
    _id: partyId,
    entityId,
    name: 'Globex',
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
})

describe('ledger invariants (enforced by a MongoDB document validator, not by app code)', () => {
  test('an unbalanced entry is refused at insert', async () => {
    const [ar] = await db.accounts.find({ entityId, code: '1100' }).toArray()
    const [sales] = await db.accounts.find({ entityId, code: '4000' }).toArray()
    const [period] = await db.accountingPeriods.find({ entityId }).limit(1).toArray()

    await assert.rejects(
      withTransaction(db, (tx) =>
        postJournalEntry(tx, {
          entityId,
          periodId: period._id,
          entryDate: '2026-04-05',
          sourceType: 'test',
          lines: [
            { accountId: ar._id, debitMinor: 100_000 },
            { accountId: sales._id, creditMinor: 99_999 },
          ],
        }),
      ),
      rejectsValidation(),
    )
  })

  test('a journal line cannot be both a debit and a credit', async () => {
    const [ar] = await db.accounts.find({ entityId, code: '1100' }).toArray()
    const [period] = await db.accountingPeriods.find({ entityId }).limit(1).toArray()

    await assert.rejects(
      db.journalEntries.insertOne({
        _id: newId(),
        entityId,
        periodId: period._id,
        entryDate: '2026-04-05',
        sourceType: 'test',
        sourceId: null,
        memo: '',
        reversalOfId: null,
        postedAt: new Date(),
        postedBy: null,
        lines: [{ lineNo: 1, accountId: ar._id, partyId: null, debitMinor: 500, creditMinor: 500, memo: '' }],
      }),
      rejectsValidation(),
    )
  })

  test('an empty entry is refused', async () => {
    const [period] = await db.accountingPeriods.find({ entityId }).limit(1).toArray()

    await assert.rejects(
      db.journalEntries.insertOne({
        _id: newId(),
        entityId,
        periodId: period._id,
        entryDate: '2026-04-05',
        sourceType: 'test',
        sourceId: null,
        memo: '',
        reversalOfId: null,
        postedAt: new Date(),
        postedBy: null,
        lines: [],
      }),
      rejectsValidation(),
    )
  })

  test('posted documents and journal entries cannot be edited through the domain layer', async () => {
    const { doc } = await makeDraft({
      lines: [{ description: 'Work', quantity: '1', unitPriceMinor: 100_000, taxRatePercent: '18' }],
    })
    await withTransaction(db, (tx) => postInvoice(tx, doc._id))

    // postInvoice on an already-posted document is the domain layer's own
    // check refusing a second post -- there is no separate "edit" entry point
    // to call instead, which is the point: the only door in is closed.
    await assert.rejects(
      withTransaction(db, (tx) => postInvoice(tx, doc._id)),
      (error: unknown) => error instanceof PostingError && error.code === 'not_draft',
    )
  })

  test(
    'unlike Postgres, MongoDB itself does not stop a write that skips the domain layer entirely',
    async () => {
      // This is the boundary of the guarantee, made explicit rather than
      // assumed: a raw driver update -- one that does not go through
      // domain/posting.ts at all -- can still edit a posted document, because
      // no MongoDB validator can see what a document used to be, only what it
      // is being written as. See the comment on postInvoice for what that
      // means for a deployment that wants this closed off too.
      const { doc } = await makeDraft({
        lines: [{ description: 'Work', quantity: '1', unitPriceMinor: 40_000, taxRatePercent: '18' }],
      })
      await withTransaction(db, (tx) => postInvoice(tx, doc._id))

      await db.documents.updateOne({ _id: doc._id }, { $set: { notes: 'edited directly, bypassing posting.ts' } })
      const reloaded = await db.documents.findOne({ _id: doc._id })
      assert.equal(reloaded?.notes, 'edited directly, bypassing posting.ts')
    },
  )
})

describe('posting an invoice', () => {
  test('writes a balanced entry: Dr AR, Cr Sales, Cr GST', async () => {
    const { doc, priced } = await makeDraft({
      lines: [{ description: 'Retainer', quantity: '1', unitPriceMinor: 5_000_000, taxRatePercent: '18' }],
    })

    assert.equal(priced.subtotalMinor, 5_000_000)
    assert.equal(priced.taxMinor, 900_000)
    assert.equal(priced.totalMinor, 5_900_000)

    const result = await withTransaction(db, (tx) => postInvoice(tx, doc._id))
    assert.match(result.number, /^INV-\d{5}$/)

    const entry = await db.journalEntries.findOne({ sourceId: doc._id })
    assert.ok(entry)

    const accounts = await db.accounts.find({ _id: { $in: entry.lines.map((l) => l.accountId) } }).toArray()
    const codeOf = new Map(accounts.map((a) => [a._id, a.code]))
    const byCode = Object.fromEntries(
      entry.lines.map((l) => [codeOf.get(l.accountId), { debit: l.debitMinor, credit: l.creditMinor }]),
    )

    assert.equal(byCode['1100'].debit, 5_900_000)
    assert.equal(byCode['4000'].credit, 5_000_000)
    assert.equal(byCode['2200'].credit, 900_000)

    const totalDebit = entry.lines.reduce((s, l) => s + l.debitMinor, 0)
    const totalCredit = entry.lines.reduce((s, l) => s + l.creditMinor, 0)
    assert.equal(totalDebit, totalCredit)
  })

  test('records an audit row and an outbox event in the same transaction', async () => {
    const { doc } = await makeDraft({
      lines: [{ description: 'Work', quantity: '1', unitPriceMinor: 10_000, taxRatePercent: '0' }],
    })
    await withTransaction(db, (tx) => postInvoice(tx, doc._id, { email: 'admin@acme.test' }))

    const audits = await db.auditLog.find({ recordId: doc._id, action: 'post' }).toArray()
    assert.equal(audits.length, 1)
    assert.equal(audits[0].actorEmail, 'admin@acme.test')

    const events = await db.outbox.find({ topic: 'invoice.posted' }).toArray()
    assert.ok(events.length >= 1)
  })

  test('a posted invoice refuses to post twice, through the same function everything else uses', async () => {
    const { doc } = await makeDraft({
      lines: [{ description: 'Work', quantity: '1', unitPriceMinor: 25_000, taxRatePercent: '18' }],
    })
    await withTransaction(db, (tx) => postInvoice(tx, doc._id))

    await assert.rejects(
      withTransaction(db, (tx) => postInvoice(tx, doc._id)),
      (error: unknown) => error instanceof PostingError && error.code === 'not_draft',
    )
  })

  test('the e-invoice stamp is the one edit a posted invoice accepts, and only through that one route', async () => {
    const { doc } = await makeDraft({
      lines: [{ description: 'Work', quantity: '1', unitPriceMinor: 25_000, taxRatePercent: '18' }],
    })
    await withTransaction(db, (tx) => postInvoice(tx, doc._id))

    const irn = 'a'.repeat(64)
    // This mirrors exactly what POST /documents/:id/irn does: a direct, narrow
    // update of only the e-invoice fields. It is the one write to a posted
    // document the application condones, not something MongoDB enforces.
    await db.documents.updateOne(
      { _id: doc._id },
      { $set: { irn, ackNo: '112410000123', ackDate: '2026-08-17 10:32:00', signedQrCode: 'eyJ.a.b' } },
    )

    const stamped = await db.documents.findOne({ _id: doc._id })
    assert.equal(stamped?.irn, irn)
    assert.equal(stamped?.status, 'posted')
  })

  test('posting twice is refused', async () => {
    const { doc } = await makeDraft({
      lines: [{ description: 'Work', quantity: '1', unitPriceMinor: 5_000, taxRatePercent: '0' }],
    })
    await withTransaction(db, (tx) => postInvoice(tx, doc._id))
    await assert.rejects(
      withTransaction(db, (tx) => postInvoice(tx, doc._id)),
      (error: unknown) => error instanceof PostingError && error.code === 'not_draft',
    )
  })
})

describe('period control', () => {
  test('posting into a closed period is refused, and nothing is written', async () => {
    const period = await db.accountingPeriods.findOne({ entityId, startsOn: '2026-07-01' })
    await db.accountingPeriods.updateOne({ _id: period!._id }, { $set: { state: 'closed' } })

    const { doc } = await makeDraft({
      lines: [{ description: 'July work', quantity: '1', unitPriceMinor: 90_000, taxRatePercent: '18' }],
      issueDate: '2026-07-15',
    })

    const before = await db.journalEntries.countDocuments({})

    await assert.rejects(
      withTransaction(db, (tx) => postInvoice(tx, doc._id)),
      (error: unknown) => error instanceof PostingError && error.code === 'period_closed',
    )

    const after = await db.journalEntries.countDocuments({})
    assert.equal(after, before, 'a refused posting must write nothing')

    const stillDraft = await db.documents.findOne({ _id: doc._id })
    assert.equal(stillDraft?.status, 'draft')
    assert.equal(stillDraft?.docNumber, null)
  })
})

describe('document numbering', () => {
  test('numbers are sequential and gapless', async () => {
    const numbers: string[] = []
    for (let i = 0; i < 5; i += 1) {
      const { doc } = await makeDraft({
        lines: [{ description: `Job ${i}`, quantity: '1', unitPriceMinor: 1_000, taxRatePercent: '0' }],
      })
      const result = await withTransaction(db, (tx) => postInvoice(tx, doc._id))
      numbers.push(result.number)
    }

    const values = numbers.map((n) => Number(n.replace('INV-', '')))
    for (let i = 1; i < values.length; i += 1) {
      assert.equal(values[i], values[i - 1] + 1, `gap between ${numbers[i - 1]} and ${numbers[i]}`)
    }
  })

  test('a rolled-back posting does not burn a number', async () => {
    const fy = fiscalYearOf('2026-08-05')
    const before = await db.numberSeries.findOne({ entityId, docType: 'invoice' })

    await assert.rejects(
      withTransaction(db, async (tx) => {
        await takeNextNumber(tx, entityId, 'invoice', fy)
        throw new Error('deliberate rollback')
      }),
      /deliberate rollback/,
    )

    const after = await db.numberSeries.findOne({ entityId, docType: 'invoice' })
    assert.equal(after?.nextValue, before?.nextValue, 'the sequence must not advance when the transaction rolls back')
  })

  test('concurrent posting never issues the same number twice', async () => {
    const drafts = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        makeDraft({
          lines: [{ description: `Concurrent ${i}`, quantity: '1', unitPriceMinor: 2_000, taxRatePercent: '0' }],
        }),
      ),
    )

    const results = await Promise.all(
      drafts.map(({ doc }) => withTransaction(db, (tx) => postInvoice(tx, doc._id))),
    )

    const numbers = results.map((r) => r.number)
    assert.equal(new Set(numbers).size, numbers.length, `duplicate numbers issued: ${numbers}`)
  })
})

describe('GST', () => {
  test('intra-state splits into CGST and SGST that sum to the total', () => {
    const priced = priceDocument({
      lines: [{ description: 'x', quantity: '1', unitPriceMinor: 100_001, taxRatePercent: '18' }],
      discountType: 'fixed',
      discountValue: '0',
      supplyKind: 'intra_state',
    })

    const taxes = priced.lines[0].taxes
    assert.deepEqual(taxes.map((t) => t.component), ['CGST', 'SGST'])
    assert.equal(taxes[0].ratePercent, '9')
    assert.equal(
      taxes[0].amountMinor + taxes[1].amountMinor,
      priced.lines[0].lineTaxMinor,
      'the halves must reconstitute the total exactly',
    )
  })

  test('inter-state is a single IGST at the full rate', () => {
    const priced = priceDocument({
      lines: [{ description: 'x', quantity: '1', unitPriceMinor: 100_000, taxRatePercent: '18' }],
      discountType: 'fixed',
      discountValue: '0',
      supplyKind: 'inter_state',
    })
    assert.deepEqual(priced.lines[0].taxes.map((t) => t.component), ['IGST'])
    assert.equal(priced.lines[0].taxes[0].ratePercent, '18')
    assert.equal(priced.lines[0].taxes[0].amountMinor, 18_000)
  })

  test('place of supply decides which applies', () => {
    assert.equal(resolveSupplyKind('29', '29'), 'intra_state')
    assert.equal(resolveSupplyKind('29', '27'), 'inter_state')
  })

  test('tax is charged on the post-discount amount', () => {
    const priced = priceDocument({
      lines: [{ description: 'x', quantity: '1', unitPriceMinor: 100_000, taxRatePercent: '18' }],
      discountType: 'percentage',
      discountValue: '10',
      supplyKind: 'inter_state',
    })
    assert.equal(priced.discountMinor, 10_000)
    assert.equal(priced.taxMinor, 16_200, '18% of 900, not of 1000')
    assert.equal(priced.totalMinor, 106_200)
  })

  test('an apportioned discount always sums back to the invoice discount', () => {
    const priced = priceDocument({
      lines: [
        { description: 'a', quantity: '1', unitPriceMinor: 3_333, taxRatePercent: '18' },
        { description: 'b', quantity: '1', unitPriceMinor: 3_333, taxRatePercent: '18' },
        { description: 'c', quantity: '1', unitPriceMinor: 3_334, taxRatePercent: '18' },
      ],
      discountType: 'fixed',
      discountValue: '10',
      supplyKind: 'intra_state',
    })
    const allocated = priced.lines.reduce((sum, l) => sum + l.lineDiscountMinor, 0)
    assert.equal(allocated, priced.discountMinor)
    assert.equal(allocated, 1_000)
  })
})

describe('payments and receivables', () => {
  test('a payment settles an invoice and the AR balance follows the ledger', async () => {
    const { doc: invoice } = await makeDraft({
      lines: [{ description: 'Big job', quantity: '1', unitPriceMinor: 1_000_000, taxRatePercent: '0' }],
      issueDate: '2026-08-10',
    })
    await withTransaction(db, (tx) => postInvoice(tx, invoice._id))

    const balanceBefore = await partyBalanceMinor(db, entityId, partyId)

    const { doc: payment } = await makeDraft({
      lines: [{ description: 'Receipt', quantity: '1', unitPriceMinor: 400_000, taxRatePercent: '0' }],
      issueDate: '2026-08-12',
      docType: 'payment',
    })

    await withTransaction(db, (tx) =>
      postPayment(tx, payment._id, [{ documentId: invoice._id, amountMinor: 400_000 }]),
    )

    const open = await openBalanceMinor(db, invoice._id)
    assert.equal(open, 600_000)

    const balanceAfter = await partyBalanceMinor(db, entityId, partyId)
    assert.equal(balanceAfter, balanceBefore - 400_000)
  })

  test('an invoice cannot be over-allocated', async () => {
    const { doc: invoice } = await makeDraft({
      lines: [{ description: 'Small job', quantity: '1', unitPriceMinor: 50_000, taxRatePercent: '0' }],
      issueDate: '2026-08-14',
    })
    await withTransaction(db, (tx) => postInvoice(tx, invoice._id))

    const { doc: payment } = await makeDraft({
      lines: [{ description: 'Overpay', quantity: '1', unitPriceMinor: 90_000, taxRatePercent: '0' }],
      issueDate: '2026-08-15',
      docType: 'payment',
    })

    await assert.rejects(
      withTransaction(db, (tx) => postPayment(tx, payment._id, [{ documentId: invoice._id, amountMinor: 90_000 }])),
      (error: unknown) => error instanceof PostingError && error.code === 'unbalanced',
    )

    const reloaded = await db.documents.findOne({ _id: invoice._id })
    assert.equal(reloaded?.allocatedMinor, 0, 'the rejected allocation must not have partially applied')
  })

  test('two concurrent payments cannot both settle the same invoice past its total', async () => {
    const { doc: invoice } = await makeDraft({
      lines: [{ description: 'Contested job', quantity: '1', unitPriceMinor: 100_000, taxRatePercent: '0' }],
      issueDate: '2026-08-16',
    })
    await withTransaction(db, (tx) => postInvoice(tx, invoice._id))

    const payA = await makeDraft({
      lines: [{ description: 'Receipt A', quantity: '1', unitPriceMinor: 60_000, taxRatePercent: '0' }],
      issueDate: '2026-08-17',
      docType: 'payment',
    })
    const payB = await makeDraft({
      lines: [{ description: 'Receipt B', quantity: '1', unitPriceMinor: 60_000, taxRatePercent: '0' }],
      issueDate: '2026-08-17',
      docType: 'payment',
    })

    const results = await Promise.allSettled([
      withTransaction(db, (tx) => postPayment(tx, payA.doc._id, [{ documentId: invoice._id, amountMinor: 60_000 }])),
      withTransaction(db, (tx) => postPayment(tx, payB.doc._id, [{ documentId: invoice._id, amountMinor: 60_000 }])),
    ])

    const settled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')
    assert.equal(settled.length, 1, 'only one of the two ₹600 payments can fit inside a ₹1,000 invoice')
    assert.equal(rejected.length, 1)

    const reloaded = await db.documents.findOne({ _id: invoice._id })
    assert.equal(reloaded?.allocatedMinor, 60_000)
  })

  test('the allocation bound holds even for a write that skips postPayment entirely', async () => {
    const { doc: invoice } = await makeDraft({
      lines: [{ description: 'Bound check', quantity: '1', unitPriceMinor: 10_000, taxRatePercent: '0' }],
      issueDate: '2026-08-18',
    })
    await withTransaction(db, (tx) => postInvoice(tx, invoice._id))

    await assert.rejects(
      db.documents.updateOne({ _id: invoice._id }, { $set: { allocatedMinor: 10_001 } }),
      rejectsValidation(),
    )
  })
})

describe('corrections', () => {
  test('a credit note reduces revenue and settles the invoice', async () => {
    const { doc: invoice } = await makeDraft({
      lines: [{ description: 'Job', quantity: '1', unitPriceMinor: 200_000, taxRatePercent: '18' }],
      issueDate: '2026-08-20',
    })
    await withTransaction(db, (tx) => postInvoice(tx, invoice._id))

    const revenueBefore = (await dashboardTotals(db, entityId, '2026-08-31')).revenueMinor

    const { doc: credit } = await makeDraft({
      lines: [{ description: 'Job returned', quantity: '1', unitPriceMinor: 200_000, taxRatePercent: '18' }],
      issueDate: '2026-08-21',
      docType: 'credit_note',
      correctsDocumentId: invoice._id,
    })
    const result = await withTransaction(db, (tx) => postInvoice(tx, credit._id))
    assert.match(result.number, /^CRN-/)

    const revenueAfter = (await dashboardTotals(db, entityId, '2026-08-31')).revenueMinor
    assert.equal(revenueAfter, revenueBefore - 200_000, 'revenue falls without a special case')

    assert.equal(await openBalanceMinor(db, invoice._id), 0, 'the invoice is settled')
  })

  test('reversing a document leaves the original entry untouched', async () => {
    const { doc } = await makeDraft({
      lines: [{ description: 'Mistake', quantity: '1', unitPriceMinor: 77_000, taxRatePercent: '18' }],
      issueDate: '2026-08-25',
    })
    await withTransaction(db, (tx) => postInvoice(tx, doc._id))

    const original = await db.journalEntries.findOne({ sourceId: doc._id, sourceType: 'invoice' })

    await withTransaction(db, (tx) => reverseDocument(tx, doc._id))

    const stillThere = await db.journalEntries.findOne({ _id: original!._id })
    assert.ok(stillThere, 'the original entry survives')

    const voided = await db.documents.findOne({ _id: doc._id })
    assert.equal(voided?.status, 'voided')

    const reversal = await db.journalEntries.findOne({ reversalOfId: original!._id })
    assert.ok(reversal, 'a reversing entry exists')
  })
})

describe('reports derive from the ledger', () => {
  test('the trial balance always balances', async () => {
    const tb = await trialBalance(db, entityId)
    assert.ok(tb.rows.length > 0)
    assert.equal(
      tb.totalDebitMinor,
      tb.totalCreditMinor,
      'a trial balance that does not balance means the ledger is corrupt',
    )
  })

  test('ageing buckets open invoices by due date', async () => {
    const rows = await ageingReport(db, entityId, '2026-12-31')
    assert.ok(rows.length > 0)
    for (const row of rows) {
      assert.ok(row.openMinor > 0, 'settled invoices must not appear')
      assert.equal(row.openMinor, row.totalMinor - row.allocatedMinor)
    }
    assert.ok(rows.some((r) => r.bucket === '90+'), 'old invoices land in the oldest bucket')
  })

  test('receivable on the dashboard equals the sum of open invoices', async () => {
    const totals = await dashboardTotals(db, entityId, '2026-12-31')
    const ageing = await ageingReport(db, entityId, '2026-12-31')
    const openSum = ageing.reduce((sum, row) => sum + row.openMinor, 0)

    assert.equal(totals.receivableMinor, openSum, 'the ledger AR balance and the open invoice list must agree')
  })
})
