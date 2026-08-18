import { and, eq, sql } from 'drizzle-orm'
import {
  accountingPeriods,
  accounts,
  allocations,
  auditLog,
  documentLineTaxes,
  documentLines,
  documents,
  journalEntries,
  journalLines,
  numberSeries,
  outbox,
} from '@/db/schema'
import type { Minor } from '@/domain/money'

/** Anything with the drizzle query surface — the real db or a transaction. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = any

export class PostingError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'not_draft'
      | 'period_closed'
      | 'no_period'
      | 'no_lines'
      | 'account_missing'
      | 'unbalanced',
  ) {
    super(message)
    this.name = 'PostingError'
  }
}

/** Account codes the posting engine needs to resolve. */
export const ACCOUNT_CODES = {
  receivable: '1100',
  bank: '1000',
  sales: '4000',
  gstOutput: '2200',
} as const

/**
 * Allocates the next document number, under a row lock.
 *
 * `FOR UPDATE` serialises concurrent posters on this one row, so two invoices
 * committed at the same instant cannot take the same number. Because it runs
 * inside the caller's transaction, a rollback also returns the number rather
 * than burning it — a gap in an invoice sequence is something a tax authority
 * expects you to explain.
 */
export async function takeNextNumber(
  tx: Db,
  entityId: string,
  docType: 'invoice' | 'credit_note' | 'payment',
  fiscalYear: string,
): Promise<string> {
  const locked = await tx.execute(sql`
    SELECT id, prefix, padding, next_value
      FROM ${numberSeries}
     WHERE entity_id = ${entityId}
       AND doc_type = ${docType}
       AND fiscal_year = ${fiscalYear}
     FOR UPDATE
  `)

  const row = (locked.rows ?? locked)[0] as
    | { id: string; prefix: string; padding: number; next_value: string | number }
    | undefined

  if (!row) {
    throw new PostingError(
      `No ${docType} number series for ${fiscalYear}. Create one before posting.`,
      'no_period',
    )
  }

  const value = Number(row.next_value)

  await tx
    .update(numberSeries)
    .set({ nextValue: value + 1 })
    .where(eq(numberSeries.id, row.id))

  return `${row.prefix}${String(value).padStart(row.padding, '0')}`
}

/** The open period containing `date`, or an explanatory failure. */
export async function requireOpenPeriod(tx: Db, entityId: string, date: string) {
  const [period] = await tx
    .select()
    .from(accountingPeriods)
    .where(
      and(
        eq(accountingPeriods.entityId, entityId),
        sql`${accountingPeriods.startsOn} <= ${date}`,
        sql`${accountingPeriods.endsOn} >= ${date}`,
      ),
    )
    .limit(1)

  if (!period) {
    throw new PostingError(
      `No accounting period covers ${date}. Open one before posting.`,
      'no_period',
    )
  }

  if (period.state !== 'open') {
    throw new PostingError(
      `${period.name} is ${period.state.replace('_', ' ')}. Reopen it or change the document date.`,
      'period_closed',
    )
  }

  return period
}

async function accountByCode(tx: Db, entityId: string, code: string) {
  const [account] = await tx
    .select()
    .from(accounts)
    .where(and(eq(accounts.entityId, entityId), eq(accounts.code, code)))
    .limit(1)

  if (!account) {
    throw new PostingError(`Chart of accounts is missing account ${code}.`, 'account_missing')
  }
  if (!account.isPostable) {
    throw new PostingError(`Account ${code} is a heading and cannot take postings.`, 'account_missing')
  }
  return account
}

export interface JournalLineInput {
  accountId: string
  partyId?: string | null
  debitMinor?: Minor
  creditMinor?: Minor
  memo?: string
}

/**
 * Writes one balanced journal entry.
 *
 * The balance check is not performed here — it is a deferred constraint trigger
 * in the database, so it holds for every writer, including a psql session. This
 * function only assembles the lines.
 */
export async function postJournalEntry(
  tx: Db,
  input: {
    entityId: string
    periodId: string
    entryDate: string
    sourceType: string
    sourceId?: string | null
    memo?: string
    postedBy?: string | null
    lines: JournalLineInput[]
  },
) {
  const meaningful = input.lines.filter(
    (line) => (line.debitMinor ?? 0) > 0 || (line.creditMinor ?? 0) > 0,
  )

  if (meaningful.length === 0) {
    throw new PostingError('A journal entry needs at least one line with a value.', 'unbalanced')
  }

  const [entry] = await tx
    .insert(journalEntries)
    .values({
      entityId: input.entityId,
      periodId: input.periodId,
      entryDate: input.entryDate,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      memo: input.memo ?? '',
      postedBy: input.postedBy ?? null,
    })
    .returning()

  await tx.insert(journalLines).values(
    meaningful.map((line, index) => ({
      entryId: entry.id,
      lineNo: index + 1,
      accountId: line.accountId,
      partyId: line.partyId ?? null,
      debitMinor: line.debitMinor ?? 0,
      creditMinor: line.creditMinor ?? 0,
      memo: line.memo ?? '',
    })),
  )

  return entry
}

export async function recordAudit(
  tx: Db,
  input: {
    entityId?: string | null
    actorId?: string | null
    actorEmail?: string
    action: string
    recordType: string
    recordId?: string | null
    before?: unknown
    after?: unknown
  },
) {
  await tx.insert(auditLog).values({
    entityId: input.entityId ?? null,
    actorId: input.actorId ?? null,
    actorEmail: input.actorEmail ?? '',
    action: input.action,
    recordType: input.recordType,
    recordId: input.recordId ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
  })
}

/** Indian fiscal year for a date: 2026-08-01 -> "2026-27". */
export function fiscalYearOf(date: string): string {
  const [year, month] = date.split('-').map(Number)
  const startYear = month >= 4 ? year : year - 1
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`
}

/**
 * Posts a draft invoice: takes a number, checks the period, writes the ledger
 * entry and queues the outbound event — all inside the caller's transaction.
 *
 * Dr Accounts Receivable / Cr Sales / Cr GST Output.
 */
export async function postInvoice(
  tx: Db,
  documentId: string,
  actor: { id?: string | null; email?: string } = {},
) {
  const [doc] = await tx.select().from(documents).where(eq(documents.id, documentId)).limit(1)

  if (!doc) throw new PostingError('That document no longer exists.', 'not_draft')
  if (doc.status !== 'draft') {
    throw new PostingError(
      `${doc.docNumber ?? 'This document'} is already ${doc.status}.`,
      'not_draft',
    )
  }

  const lines = await tx
    .select()
    .from(documentLines)
    .where(eq(documentLines.documentId, documentId))

  if (lines.length === 0) {
    throw new PostingError('An invoice needs at least one line.', 'no_lines')
  }

  const period = await requireOpenPeriod(tx, doc.entityId, doc.issueDate)
  const number = await takeNextNumber(
    tx,
    doc.entityId,
    doc.docType,
    fiscalYearOf(doc.issueDate),
  )

  const receivable = await accountByCode(tx, doc.entityId, ACCOUNT_CODES.receivable)
  const gstOutput = await accountByCode(tx, doc.entityId, ACCOUNT_CODES.gstOutput)
  const defaultSales = await accountByCode(tx, doc.entityId, ACCOUNT_CODES.sales)

  const isCredit = doc.docType === 'credit_note'

  // Income is credited per line so a P&L can break down by account; the
  // receivable is a single line for the whole document.
  const incomeByAccount = new Map<string, Minor>()
  for (const line of lines) {
    const accountId = line.incomeAccountId ?? defaultSales.id
    const net = line.lineSubtotalMinor - line.lineDiscountMinor
    incomeByAccount.set(accountId, (incomeByAccount.get(accountId) ?? 0) + net)
  }

  const journal: JournalLineInput[] = []

  if (isCredit) {
    for (const [accountId, amount] of incomeByAccount) {
      journal.push({ accountId, debitMinor: amount, memo: 'Sales returned' })
    }
    if (doc.taxMinor > 0) {
      journal.push({ accountId: gstOutput.id, debitMinor: doc.taxMinor, memo: 'GST reversed' })
    }
    journal.push({
      accountId: receivable.id,
      partyId: doc.partyId,
      creditMinor: doc.totalMinor,
    })
  } else {
    journal.push({
      accountId: receivable.id,
      partyId: doc.partyId,
      debitMinor: doc.totalMinor,
    })
    for (const [accountId, amount] of incomeByAccount) {
      journal.push({ accountId, creditMinor: amount })
    }
    if (doc.taxMinor > 0) {
      journal.push({ accountId: gstOutput.id, creditMinor: doc.taxMinor, memo: 'GST payable' })
    }
  }

  const entry = await postJournalEntry(tx, {
    entityId: doc.entityId,
    periodId: period.id,
    entryDate: doc.issueDate,
    sourceType: doc.docType,
    sourceId: doc.id,
    memo: `${isCredit ? 'Credit note' : 'Invoice'} ${number}`,
    postedBy: actor.id ?? null,
    lines: journal,
  })

  await tx
    .update(documents)
    .set({
      status: 'posted',
      docNumber: number,
      postedAt: new Date(),
      postedBy: actor.id ?? null,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, documentId))

  // A credit note settles the invoice it corrects, up to what is still open.
  if (isCredit && doc.correctsDocumentId) {
    const open = await openBalanceMinor(tx, doc.correctsDocumentId)
    const amount = Math.min(open, doc.totalMinor)
    if (amount > 0) {
      await tx.insert(allocations).values({
        entityId: doc.entityId,
        fromDocumentId: doc.id,
        toDocumentId: doc.correctsDocumentId,
        amountMinor: amount,
      })
    }
  }

  await recordAudit(tx, {
    entityId: doc.entityId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'post',
    recordType: 'document',
    recordId: doc.id,
    before: { status: 'draft', docNumber: null },
    after: { status: 'posted', docNumber: number, journalEntryId: entry.id },
  })

  // Inside the transaction on purpose: a rollback must not leave a webhook
  // already delivered, and a commit must not fail to notify.
  await tx.insert(outbox).values({
    topic: isCredit ? 'credit_note.posted' : 'invoice.posted',
    payload: { documentId: doc.id, number, totalMinor: doc.totalMinor },
  })

  return { number, journalEntryId: entry.id }
}

/** How much of a document is still unsettled. */
export async function openBalanceMinor(tx: Db, documentId: string): Promise<Minor> {
  const [doc] = await tx
    .select({ total: documents.totalMinor })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1)

  if (!doc) return 0

  const [row] = await tx
    .select({ allocated: sql<string>`COALESCE(SUM(${allocations.amountMinor}), 0)` })
    .from(allocations)
    .where(eq(allocations.toDocumentId, documentId))

  return doc.total - Number(row?.allocated ?? 0)
}

/**
 * Posts a payment and allocates it across invoices.
 *
 * Dr Bank / Cr Accounts Receivable. The customer's balance is never a column
 * anywhere — it is the sum of their AR lines, so it cannot disagree with the
 * books.
 */
export async function postPayment(
  tx: Db,
  documentId: string,
  targets: Array<{ documentId: string; amountMinor: Minor }>,
  actor: { id?: string | null; email?: string } = {},
) {
  const [doc] = await tx.select().from(documents).where(eq(documents.id, documentId)).limit(1)

  if (!doc) throw new PostingError('That payment no longer exists.', 'not_draft')
  if (doc.status !== 'draft') {
    throw new PostingError('That payment has already been posted.', 'not_draft')
  }

  const period = await requireOpenPeriod(tx, doc.entityId, doc.issueDate)
  const number = await takeNextNumber(tx, doc.entityId, 'payment', fiscalYearOf(doc.issueDate))

  const bank = await accountByCode(tx, doc.entityId, ACCOUNT_CODES.bank)
  const receivable = await accountByCode(tx, doc.entityId, ACCOUNT_CODES.receivable)

  const entry = await postJournalEntry(tx, {
    entityId: doc.entityId,
    periodId: period.id,
    entryDate: doc.issueDate,
    sourceType: 'payment',
    sourceId: doc.id,
    memo: `Payment ${number}`,
    postedBy: actor.id ?? null,
    lines: [
      { accountId: bank.id, debitMinor: doc.totalMinor },
      { accountId: receivable.id, partyId: doc.partyId, creditMinor: doc.totalMinor },
    ],
  })

  for (const target of targets) {
    if (target.amountMinor <= 0) continue
    await tx.insert(allocations).values({
      entityId: doc.entityId,
      fromDocumentId: doc.id,
      toDocumentId: target.documentId,
      amountMinor: target.amountMinor,
    })
  }

  await tx
    .update(documents)
    .set({
      status: 'posted',
      docNumber: number,
      postedAt: new Date(),
      postedBy: actor.id ?? null,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, documentId))

  await recordAudit(tx, {
    entityId: doc.entityId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'post',
    recordType: 'payment',
    recordId: doc.id,
    after: { number, journalEntryId: entry.id },
  })

  await tx.insert(outbox).values({
    topic: 'payment.posted',
    payload: { documentId: doc.id, number, totalMinor: doc.totalMinor },
  })

  return { number, journalEntryId: entry.id }
}

/** Reverses a posted document with a fresh, opposite entry. */
export async function reverseDocument(
  tx: Db,
  documentId: string,
  actor: { id?: string | null; email?: string } = {},
) {
  const [doc] = await tx.select().from(documents).where(eq(documents.id, documentId)).limit(1)
  if (!doc) throw new PostingError('That document no longer exists.', 'not_draft')
  if (doc.status !== 'posted') {
    throw new PostingError('Only a posted document can be reversed.', 'not_draft')
  }

  const [original] = await tx
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.sourceType, doc.docType), eq(journalEntries.sourceId, doc.id)))
    .limit(1)

  if (!original) throw new PostingError('No ledger entry found for that document.', 'unbalanced')

  const originalLines = await tx
    .select()
    .from(journalLines)
    .where(eq(journalLines.entryId, original.id))

  const period = await requireOpenPeriod(tx, doc.entityId, doc.issueDate)

  const [reversal] = await tx
    .insert(journalEntries)
    .values({
      entityId: doc.entityId,
      periodId: period.id,
      entryDate: doc.issueDate,
      sourceType: `${doc.docType}_reversal`,
      sourceId: doc.id,
      memo: `Reversal of ${doc.docNumber}`,
      reversalOfId: original.id,
      postedBy: actor.id ?? null,
    })
    .returning()

  await tx.insert(journalLines).values(
    originalLines.map((line: typeof journalLines.$inferSelect, index: number) => ({
      entryId: reversal.id,
      lineNo: index + 1,
      accountId: line.accountId,
      partyId: line.partyId,
      // Swap the sides. The original entry is left exactly as it was.
      debitMinor: line.creditMinor,
      creditMinor: line.debitMinor,
      memo: 'reversal',
    })),
  )

  await tx
    .update(documents)
    .set({ status: 'voided', voidedAt: new Date(), updatedAt: new Date() })
    .where(eq(documents.id, documentId))

  await recordAudit(tx, {
    entityId: doc.entityId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'void',
    recordType: 'document',
    recordId: doc.id,
    before: { status: 'posted' },
    after: { status: 'voided', reversalEntryId: reversal.id },
  })

  return { reversalEntryId: reversal.id }
}

/** Line-item taxes for a document, used when saving a draft. */
export async function replaceDocumentLines(
  tx: Db,
  documentId: string,
  lines: Array<{
    lineNo: number
    itemId?: string | null
    description: string
    hsnSac: string
    unit: string
    quantity: string
    unitPriceMinor: Minor
    taxRatePercent: string
    incomeAccountId?: string | null
    lineSubtotalMinor: Minor
    lineDiscountMinor: Minor
    lineTaxMinor: Minor
    lineTotalMinor: Minor
    taxes: Array<{
      component: string
      ratePercent: string
      taxableMinor: Minor
      amountMinor: Minor
    }>
  }>,
) {
  await tx.delete(documentLines).where(eq(documentLines.documentId, documentId))

  for (const line of lines) {
    const [saved] = await tx
      .insert(documentLines)
      .values({
        documentId,
        lineNo: line.lineNo,
        itemId: line.itemId ?? null,
        description: line.description,
        hsnSac: line.hsnSac,
        unit: line.unit,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        taxRatePercent: line.taxRatePercent,
        incomeAccountId: line.incomeAccountId ?? null,
        lineSubtotalMinor: line.lineSubtotalMinor,
        lineDiscountMinor: line.lineDiscountMinor,
        lineTaxMinor: line.lineTaxMinor,
        lineTotalMinor: line.lineTotalMinor,
      })
      .returning()

    if (line.taxes.length > 0) {
      await tx.insert(documentLineTaxes).values(
        line.taxes.map((tax) => ({
          documentLineId: saved.id,
          component: tax.component,
          ratePercent: tax.ratePercent,
          taxableMinor: tax.taxableMinor,
          amountMinor: tax.amountMinor,
        })),
      )
    }
  }
}
