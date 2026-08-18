import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import { and, eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '@/db/testing'
import {
  accountingPeriods,
  accounts,
  auditLog,
  documentLines,
  documents,
  journalEntries,
  journalLines,
  numberSeries,
  outbox,
  parties,
} from '@/db/schema'
import { seedEntity } from '@/domain/seed'
import {
  PostingError,
  fiscalYearOf,
  openBalanceMinor,
  postInvoice,
  postPayment,
  replaceDocumentLines,
  reverseDocument,
  takeNextNumber,
} from '@/domain/posting'
import { priceDocument, resolveSupplyKind } from '@/domain/pricing'
import { ageingReport, dashboardTotals, partyBalanceMinor, trialBalance } from '@/domain/reports'

let db: TestDb
let entityId: string
let partyId: string

interface PgError {
  code?: string
  constraint?: string
  message?: string
}

/**
 * Drizzle wraps driver errors as "Failed query: ...", so the useful detail --
 * the SQLSTATE and the constraint that actually fired -- lives on `cause`.
 * Asserting on those is far more precise than pattern-matching a message.
 */
function pgErrorOf(error: unknown): PgError {
  const cause = (error as { cause?: PgError })?.cause
  return cause ?? (error as PgError)
}

/** Asserts the rejection came from a specific database constraint. */
function rejectsWithConstraint(constraint: string) {
  return (error: unknown) => {
    const pg = pgErrorOf(error)
    assert.equal(pg.constraint, constraint, `expected constraint ${constraint}, got ${pg.constraint}`)
    return true
  }
}

/** Asserts the rejection came from one of our PL/pgSQL guard triggers. */
function rejectsWithMessage(pattern: RegExp) {
  return (error: unknown) => {
    const pg = pgErrorOf(error)
    assert.match(String(pg.message ?? ''), pattern)
    return true
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

  const [doc] = await db
    .insert(documents)
    .values({
      entityId,
      docType: options.docType ?? 'invoice',
      partyId,
      partySnapshot: {
        name: 'Globex',
        email: '',
        phone: '',
        gstin: '',
        stateCode: '29',
        address: '',
      },
      issueDate: options.issueDate ?? '2026-08-05',
      dueDate: options.dueDate === undefined ? '2026-09-05' : options.dueDate,
      subtotalMinor: priced.subtotalMinor,
      discountMinor: priced.discountMinor,
      taxMinor: priced.taxMinor,
      totalMinor: priced.totalMinor,
      supplyKind: options.supplyKind ?? 'intra_state',
      correctsDocumentId: options.correctsDocumentId ?? null,
    })
    .returning()

  await replaceDocumentLines(
    db,
    doc.id,
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
  )

  return { doc, priced }
}

before(async () => {
  db = await createTestDb()
  const entity = await seedEntity(db, { name: 'Acme Consulting', stateCode: '29', startYear: 2026 })
  entityId = entity.id
  const [party] = await db
    .insert(parties)
    .values({ entityId, name: 'Globex', stateCode: '29' })
    .returning()
  partyId = party.id
})

describe('ledger invariants (enforced by PostgreSQL, not by app code)', () => {
  test('an unbalanced entry is refused at commit', async () => {
    const [ar] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.entityId, entityId), eq(accounts.code, '1100')))
    const [sales] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.entityId, entityId), eq(accounts.code, '4000')))
    const [period] = await db
      .select()
      .from(accountingPeriods)
      .where(eq(accountingPeriods.entityId, entityId))
      .limit(1)

    await assert.rejects(
      db.transaction(async (tx) => {
        const [entry] = await tx
          .insert(journalEntries)
          .values({
            entityId,
            periodId: period.id,
            entryDate: '2026-04-05',
            sourceType: 'test',
          })
          .returning()
        await tx.insert(journalLines).values([
          { entryId: entry.id, lineNo: 1, accountId: ar.id, debitMinor: 100_000 },
          { entryId: entry.id, lineNo: 2, accountId: sales.id, creditMinor: 99_999 },
        ])
      }),
      rejectsWithMessage(/is unbalanced: debits \d+, credits \d+/),
    )
  })

  test('a journal line cannot be both a debit and a credit', async () => {
    const [ar] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.entityId, entityId), eq(accounts.code, '1100')))
    const [period] = await db
      .select()
      .from(accountingPeriods)
      .where(eq(accountingPeriods.entityId, entityId))
      .limit(1)

    await assert.rejects(
      db.transaction(async (tx) => {
        const [entry] = await tx
          .insert(journalEntries)
          .values({ entityId, periodId: period.id, entryDate: '2026-04-05', sourceType: 'test' })
          .returning()
        await tx.insert(journalLines).values({
          entryId: entry.id,
          lineNo: 1,
          accountId: ar.id,
          debitMinor: 500,
          creditMinor: 500,
        })
      }),
      rejectsWithConstraint('journal_lines_one_sided'),
    )
  })

  test('posted ledger rows cannot be updated or deleted', async () => {
    const { doc } = await makeDraft({
      lines: [{ description: 'Work', quantity: '1', unitPriceMinor: 100_000, taxRatePercent: '18' }],
    })
    await db.transaction(async (tx) => postInvoice(tx, doc.id))

    const [entry] = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.sourceId, doc.id))
      .limit(1)

    await assert.rejects(
      db.update(journalLines).set({ memo: 'tampered' }).where(eq(journalLines.entryId, entry.id)),
      rejectsWithMessage(/append-only/i),
    )
    await assert.rejects(
      db.delete(journalEntries).where(eq(journalEntries.id, entry.id)),
      rejectsWithMessage(/append-only/i),
    )
  })
})

describe('posting an invoice', () => {
  test('writes a balanced entry: Dr AR, Cr Sales, Cr GST', async () => {
    const { doc, priced } = await makeDraft({
      lines: [{ description: 'Retainer', quantity: '1', unitPriceMinor: 5_000_000, taxRatePercent: '18' }],
    })

    assert.equal(priced.subtotalMinor, 5_000_000)
    assert.equal(priced.taxMinor, 900_000)
    assert.equal(priced.totalMinor, 5_900_000)

    const result = await db.transaction(async (tx) => postInvoice(tx, doc.id))
    assert.match(result.number, /^INV-\d{5}$/)

    const [entry] = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.sourceId, doc.id))
      .limit(1)

    const lines = await db
      .select({
        code: accounts.code,
        debit: journalLines.debitMinor,
        credit: journalLines.creditMinor,
      })
      .from(journalLines)
      .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
      .where(eq(journalLines.entryId, entry.id))

    const byCode = Object.fromEntries(lines.map((l) => [l.code, l]))
    assert.equal(byCode['1100'].debit, 5_900_000)
    assert.equal(byCode['4000'].credit, 5_000_000)
    assert.equal(byCode['2200'].credit, 900_000)

    const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0)
    assert.equal(totalDebit, totalCredit)
  })

  test('records an audit row and an outbox event in the same transaction', async () => {
    const { doc } = await makeDraft({
      lines: [{ description: 'Work', quantity: '1', unitPriceMinor: 10_000, taxRatePercent: '0' }],
    })
    await db.transaction(async (tx) => postInvoice(tx, doc.id, { email: 'admin@acme.test' }))

    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.recordId, doc.id), eq(auditLog.action, 'post')))
    assert.equal(audits.length, 1)
    assert.equal(audits[0].actorEmail, 'admin@acme.test')

    const events = await db.select().from(outbox).where(eq(outbox.topic, 'invoice.posted'))
    assert.ok(events.length >= 1)
  })

  test('a posted invoice cannot be edited or deleted', async () => {
    const { doc } = await makeDraft({
      lines: [{ description: 'Work', quantity: '1', unitPriceMinor: 25_000, taxRatePercent: '18' }],
    })
    await db.transaction(async (tx) => postInvoice(tx, doc.id))

    await assert.rejects(
      db.update(documents).set({ totalMinor: 1 }).where(eq(documents.id, doc.id)),
      rejectsWithMessage(/posted and cannot be edited/i),
    )
    await assert.rejects(
      db.delete(documents).where(eq(documents.id, doc.id)),
      rejectsWithMessage(/cannot be deleted/i),
    )
    await assert.rejects(
      db.update(documentLines).set({ description: 'x' }).where(eq(documentLines.documentId, doc.id)),
      rejectsWithMessage(/posted document/i),
    )
  })

  test('the e-invoice stamp is the one edit a posted invoice accepts', async () => {
    const { doc } = await makeDraft({
      lines: [{ description: 'Work', quantity: '1', unitPriceMinor: 25_000, taxRatePercent: '18' }],
    })
    await db.transaction(async (tx) => postInvoice(tx, doc.id))

    const irn = 'a'.repeat(64)

    await db
      .update(documents)
      .set({ irn, ackNo: '112410000123', ackDate: '2026-08-17 10:32:00', signedQrCode: 'eyJ.a.b' })
      .where(eq(documents.id, doc.id))

    const [stamped] = await db.select().from(documents).where(eq(documents.id, doc.id))
    assert.equal(stamped.irn, irn)
    assert.equal(stamped.status, 'posted')

    // Write-once: an IRN is issued by the portal, not chosen by the seller.
    await assert.rejects(
      db.update(documents).set({ irn: 'b'.repeat(64) }).where(eq(documents.id, doc.id)),
      rejectsWithMessage(/posted and cannot be edited/i),
    )
  })

  test('nothing else may ride along with the e-invoice stamp', async () => {
    const { doc } = await makeDraft({
      lines: [{ description: 'Work', quantity: '1', unitPriceMinor: 25_000, taxRatePercent: '18' }],
    })
    await db.transaction(async (tx) => postInvoice(tx, doc.id))

    await assert.rejects(
      db
        .update(documents)
        .set({ irn: 'c'.repeat(64), notes: 'quietly changed after issue' })
        .where(eq(documents.id, doc.id)),
      rejectsWithMessage(/posted and cannot be edited/i),
    )
  })

  test('posting twice is refused', async () => {
    const { doc } = await makeDraft({
      lines: [{ description: 'Work', quantity: '1', unitPriceMinor: 5_000, taxRatePercent: '0' }],
    })
    await db.transaction(async (tx) => postInvoice(tx, doc.id))
    await assert.rejects(
      db.transaction(async (tx) => postInvoice(tx, doc.id)),
      (error: unknown) => error instanceof PostingError && error.code === 'not_draft',
    )
  })
})

describe('period control', () => {
  test('posting into a closed period is refused, and nothing is written', async () => {
    const [period] = await db
      .select()
      .from(accountingPeriods)
      .where(
        and(
          eq(accountingPeriods.entityId, entityId),
          eq(accountingPeriods.startsOn, '2026-07-01'),
        ),
      )
    await db
      .update(accountingPeriods)
      .set({ state: 'closed' })
      .where(eq(accountingPeriods.id, period.id))

    const { doc } = await makeDraft({
      lines: [{ description: 'July work', quantity: '1', unitPriceMinor: 90_000, taxRatePercent: '18' }],
      issueDate: '2026-07-15',
    })

    const before = await db.select().from(journalEntries)

    await assert.rejects(
      db.transaction(async (tx) => postInvoice(tx, doc.id)),
      (error: unknown) => error instanceof PostingError && error.code === 'period_closed',
    )

    const after = await db.select().from(journalEntries)
    assert.equal(after.length, before.length, 'a refused posting must write nothing')

    const [stillDraft] = await db.select().from(documents).where(eq(documents.id, doc.id))
    assert.equal(stillDraft.status, 'draft')
    assert.equal(stillDraft.docNumber, null)
  })
})

describe('document numbering', () => {
  test('numbers are sequential and gapless', async () => {
    const numbers: string[] = []
    for (let i = 0; i < 5; i += 1) {
      const { doc } = await makeDraft({
        lines: [{ description: `Job ${i}`, quantity: '1', unitPriceMinor: 1_000, taxRatePercent: '0' }],
      })
      const result = await db.transaction(async (tx) => postInvoice(tx, doc.id))
      numbers.push(result.number)
    }

    const values = numbers.map((n) => Number(n.replace('INV-', '')))
    for (let i = 1; i < values.length; i += 1) {
      assert.equal(values[i], values[i - 1] + 1, `gap between ${numbers[i - 1]} and ${numbers[i]}`)
    }
  })

  test('a rolled-back posting does not burn a number', async () => {
    const fy = fiscalYearOf('2026-08-05')
    const [before] = await db
      .select()
      .from(numberSeries)
      .where(and(eq(numberSeries.entityId, entityId), eq(numberSeries.docType, 'invoice')))

    await assert.rejects(
      db.transaction(async (tx) => {
        await takeNextNumber(tx, entityId, 'invoice', fy)
        throw new Error('deliberate rollback')
      }),
      /deliberate rollback/,
    )

    const [after] = await db
      .select()
      .from(numberSeries)
      .where(and(eq(numberSeries.entityId, entityId), eq(numberSeries.docType, 'invoice')))

    assert.equal(
      Number(after.nextValue),
      Number(before.nextValue),
      'the sequence must not advance when the transaction rolls back',
    )
  })

  test('concurrent posting never issues the same number twice', async () => {
    const drafts = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        makeDraft({
          lines: [
            { description: `Concurrent ${i}`, quantity: '1', unitPriceMinor: 2_000, taxRatePercent: '0' },
          ],
        }),
      ),
    )

    const results = await Promise.all(
      drafts.map(({ doc }) => db.transaction(async (tx) => postInvoice(tx, doc.id))),
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
    await db.transaction(async (tx) => postInvoice(tx, invoice.id))

    const balanceBefore = await partyBalanceMinor(db, entityId, partyId)

    const { doc: payment } = await makeDraft({
      lines: [{ description: 'Receipt', quantity: '1', unitPriceMinor: 400_000, taxRatePercent: '0' }],
      issueDate: '2026-08-12',
      docType: 'payment',
    })

    await db.transaction(async (tx) =>
      postPayment(tx, payment.id, [{ documentId: invoice.id, amountMinor: 400_000 }]),
    )

    const open = await openBalanceMinor(db, invoice.id)
    assert.equal(open, 600_000)

    const balanceAfter = await partyBalanceMinor(db, entityId, partyId)
    assert.equal(balanceAfter, balanceBefore - 400_000)
  })

  test('an invoice cannot be over-allocated', async () => {
    const { doc: invoice } = await makeDraft({
      lines: [{ description: 'Small job', quantity: '1', unitPriceMinor: 50_000, taxRatePercent: '0' }],
      issueDate: '2026-08-14',
    })
    await db.transaction(async (tx) => postInvoice(tx, invoice.id))

    const { doc: payment } = await makeDraft({
      lines: [{ description: 'Overpay', quantity: '1', unitPriceMinor: 90_000, taxRatePercent: '0' }],
      issueDate: '2026-08-15',
      docType: 'payment',
    })

    await assert.rejects(
      db.transaction(async (tx) =>
        postPayment(tx, payment.id, [{ documentId: invoice.id, amountMinor: 90_000 }]),
      ),
      rejectsWithMessage(/exceed document total/i),
    )
  })
})

describe('corrections', () => {
  test('a credit note reduces revenue and settles the invoice', async () => {
    const { doc: invoice } = await makeDraft({
      lines: [{ description: 'Job', quantity: '1', unitPriceMinor: 200_000, taxRatePercent: '18' }],
      issueDate: '2026-08-20',
    })
    await db.transaction(async (tx) => postInvoice(tx, invoice.id))

    const revenueBefore = (await dashboardTotals(db, entityId, '2026-08-31')).revenueMinor

    const { doc: credit } = await makeDraft({
      lines: [{ description: 'Job returned', quantity: '1', unitPriceMinor: 200_000, taxRatePercent: '18' }],
      issueDate: '2026-08-21',
      docType: 'credit_note',
      correctsDocumentId: invoice.id,
    })
    const result = await db.transaction(async (tx) => postInvoice(tx, credit.id))
    assert.match(result.number, /^CRN-/)

    const revenueAfter = (await dashboardTotals(db, entityId, '2026-08-31')).revenueMinor
    assert.equal(revenueAfter, revenueBefore - 200_000, 'revenue falls without a special case')

    assert.equal(await openBalanceMinor(db, invoice.id), 0, 'the invoice is settled')
  })

  test('reversing a document leaves the original entry untouched', async () => {
    const { doc } = await makeDraft({
      lines: [{ description: 'Mistake', quantity: '1', unitPriceMinor: 77_000, taxRatePercent: '18' }],
      issueDate: '2026-08-25',
    })
    await db.transaction(async (tx) => postInvoice(tx, doc.id))

    const [original] = await db
      .select()
      .from(journalEntries)
      .where(and(eq(journalEntries.sourceId, doc.id), eq(journalEntries.sourceType, 'invoice')))

    await db.transaction(async (tx) => reverseDocument(tx, doc.id))

    const [stillThere] = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.id, original.id))
    assert.ok(stillThere, 'the original entry survives')

    const [voided] = await db.select().from(documents).where(eq(documents.id, doc.id))
    assert.equal(voided.status, 'voided')

    const [reversal] = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.reversalOfId, original.id))
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

    assert.equal(
      totals.receivableMinor,
      openSum,
      'the ledger AR balance and the open invoice list must agree',
    )
  })
})
