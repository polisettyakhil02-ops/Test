import { newId } from '@/db/ids'
import type { DocumentDoc, DocumentLine, JournalLine, Store } from '@/db/collections'
import type { Minor } from '@/domain/money'

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
 * Allocates the next document number, without a row lock — MongoDB has none.
 *
 * `findOneAndUpdate` incrementing `nextValue` is atomic on that one document:
 * two transactions racing for the same number-series row cannot both succeed.
 * One of them hits a write conflict, MongoDB aborts it with a
 * `TransientTransactionError`, and `withTransaction` (db/client.ts) retries the
 * whole callback from the top — which is exactly the Mongo-native replacement
 * for `SELECT ... FOR UPDATE`: the loser blocks-by-retrying instead of
 * blocking-by-waiting. Because the increment happens inside the caller's
 * transaction, an abort also rolls the counter back, so a rolled-back posting
 * does not burn a number.
 */
export async function takeNextNumber(
  store: Store,
  entityId: string,
  docType: 'invoice' | 'credit_note' | 'payment',
  fiscalYear: string,
): Promise<string> {
  const before = await store.numberSeries.findOneAndUpdate(
    { entityId, docType, fiscalYear },
    { $inc: { nextValue: 1 } },
    { session: store.session, returnDocument: 'before' },
  )

  if (!before) {
    throw new PostingError(
      `No ${docType} number series for ${fiscalYear}. Create one before posting.`,
      'no_period',
    )
  }

  return `${before.prefix}${String(before.nextValue).padStart(before.padding, '0')}`
}

/** The open period containing `date`, or an explanatory failure. */
export async function requireOpenPeriod(store: Store, entityId: string, date: string) {
  const period = await store.accountingPeriods.findOne(
    { entityId, startsOn: { $lte: date }, endsOn: { $gte: date } },
    { session: store.session },
  )

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

async function accountByCode(store: Store, entityId: string, code: string) {
  const account = await store.accounts.findOne({ entityId, code }, { session: store.session })

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
 * The balance check is not performed here in application code — it is a
 * MongoDB document validator on the `journal_entries` collection (see
 * db/indexes.ts), evaluated against this one document's embedded lines at
 * insert time. It holds for every writer, including a driver session that
 * skips this function entirely. This function only assembles the lines.
 */
export async function postJournalEntry(
  store: Store,
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

  const lines: JournalLine[] = meaningful.map((line, index) => ({
    lineNo: index + 1,
    accountId: line.accountId,
    partyId: line.partyId ?? null,
    debitMinor: line.debitMinor ?? 0,
    creditMinor: line.creditMinor ?? 0,
    memo: line.memo ?? '',
  }))

  const entry = {
    _id: newId(),
    entityId: input.entityId,
    periodId: input.periodId,
    entryDate: input.entryDate,
    sourceType: input.sourceType,
    sourceId: input.sourceId ?? null,
    memo: input.memo ?? '',
    reversalOfId: null,
    postedAt: new Date(),
    postedBy: input.postedBy ?? null,
    lines,
  }

  await store.journalEntries.insertOne(entry, { session: store.session })
  return entry
}

export async function recordAudit(
  store: Store,
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
  await store.auditLog.insertOne(
    {
      _id: newId(),
      entityId: input.entityId ?? null,
      actorId: input.actorId ?? null,
      actorEmail: input.actorEmail ?? '',
      action: input.action,
      recordType: input.recordType,
      recordId: input.recordId ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
      at: new Date(),
    },
    { session: store.session },
  )
}

/** Indian fiscal year for a date: 2026-08-01 -> "2026-27". */
export function fiscalYearOf(date: string): string {
  const [year, month] = date.split('-').map(Number)
  const startYear = month >= 4 ? year : year - 1
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`
}

async function requireDraft(store: Store, documentId: string): Promise<DocumentDoc> {
  const doc = await store.documents.findOne({ _id: documentId }, { session: store.session })
  if (!doc) throw new PostingError('That document no longer exists.', 'not_draft')
  if (doc.status !== 'draft') {
    throw new PostingError(`${doc.docNumber ?? 'This document'} is already ${doc.status}.`, 'not_draft')
  }
  return doc
}

/**
 * Posts a draft invoice: takes a number, checks the period, writes the ledger
 * entry and queues the outbound event — all inside the caller's transaction.
 *
 * Dr Accounts Receivable / Cr Sales / Cr GST Output.
 *
 * This function, `postPayment` and `reverseDocument` below are the *only*
 * permitted way to change a posted document's status or write to
 * `journal_entries`. MongoDB has no trigger that can refuse an update based on
 * what a document's previous state was — a validator only ever sees the write
 * being made, never the one it replaces — so unlike the Postgres version,
 * nothing in the storage layer stops a driver session that bypasses this
 * module from editing a posted document directly. The guarantee is enforced
 * here, in the one code path every route goes through, and its boundary is
 * tested explicitly in test/ledger.test.ts rather than assumed.
 */
export async function postInvoice(
  store: Store,
  documentId: string,
  actor: { id?: string | null; email?: string } = {},
) {
  const doc = await requireDraft(store, documentId)

  if (doc.lines.length === 0) {
    throw new PostingError('An invoice needs at least one line.', 'no_lines')
  }

  const period = await requireOpenPeriod(store, doc.entityId, doc.issueDate)
  const number = await takeNextNumber(store, doc.entityId, doc.docType, fiscalYearOf(doc.issueDate))

  const receivable = await accountByCode(store, doc.entityId, ACCOUNT_CODES.receivable)
  const gstOutput = await accountByCode(store, doc.entityId, ACCOUNT_CODES.gstOutput)
  const defaultSales = await accountByCode(store, doc.entityId, ACCOUNT_CODES.sales)

  const isCredit = doc.docType === 'credit_note'

  // Income is credited per line so a P&L can break down by account; the
  // receivable is a single line for the whole document.
  const incomeByAccount = new Map<string, Minor>()
  for (const line of doc.lines) {
    const accountId = line.incomeAccountId ?? defaultSales._id
    const net = line.lineSubtotalMinor - line.lineDiscountMinor
    incomeByAccount.set(accountId, (incomeByAccount.get(accountId) ?? 0) + net)
  }

  const journal: JournalLineInput[] = []

  if (isCredit) {
    for (const [accountId, amount] of incomeByAccount) {
      journal.push({ accountId, debitMinor: amount, memo: 'Sales returned' })
    }
    if (doc.taxMinor > 0) {
      journal.push({ accountId: gstOutput._id, debitMinor: doc.taxMinor, memo: 'GST reversed' })
    }
    journal.push({ accountId: receivable._id, partyId: doc.partyId, creditMinor: doc.totalMinor })
  } else {
    journal.push({ accountId: receivable._id, partyId: doc.partyId, debitMinor: doc.totalMinor })
    for (const [accountId, amount] of incomeByAccount) {
      journal.push({ accountId, creditMinor: amount })
    }
    if (doc.taxMinor > 0) {
      journal.push({ accountId: gstOutput._id, creditMinor: doc.taxMinor, memo: 'GST payable' })
    }
  }

  const entry = await postJournalEntry(store, {
    entityId: doc.entityId,
    periodId: period._id,
    entryDate: doc.issueDate,
    sourceType: doc.docType,
    sourceId: doc._id,
    memo: `${isCredit ? 'Credit note' : 'Invoice'} ${number}`,
    postedBy: actor.id ?? null,
    lines: journal,
  })

  await store.documents.updateOne(
    { _id: documentId },
    {
      $set: {
        status: 'posted',
        docNumber: number,
        postedAt: new Date(),
        postedBy: actor.id ?? null,
        updatedAt: new Date(),
      },
    },
    { session: store.session },
  )

  // A credit note settles the invoice it corrects, up to what is still open.
  if (isCredit && doc.correctsDocumentId) {
    const open = await openBalanceMinor(store, doc.correctsDocumentId)
    const amount = Math.min(open, doc.totalMinor)
    if (amount > 0) {
      await allocateAmount(store, doc.entityId, doc._id, doc.correctsDocumentId, amount)
    }
  }

  await recordAudit(store, {
    entityId: doc.entityId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'post',
    recordType: 'document',
    recordId: doc._id,
    before: { status: 'draft', docNumber: null },
    after: { status: 'posted', docNumber: number, journalEntryId: entry._id },
  })

  // Inside the transaction on purpose: a rollback must not leave a webhook
  // already delivered, and a commit must not fail to notify.
  await store.outbox.insertOne(
    {
      _id: newId(),
      topic: isCredit ? 'credit_note.posted' : 'invoice.posted',
      payload: { documentId: doc._id, number, totalMinor: doc.totalMinor },
      createdAt: new Date(),
      deliveredAt: null,
      attempts: 0,
      nextAttemptAt: new Date(),
      lastError: '',
    },
    { session: store.session },
  )

  return { number, journalEntryId: entry._id }
}

/** How much of a document is still unsettled. */
export async function openBalanceMinor(store: Store, documentId: string): Promise<Minor> {
  const doc = await store.documents.findOne(
    { _id: documentId },
    { session: store.session, projection: { totalMinor: 1, allocatedMinor: 1 } },
  )
  if (!doc) return 0
  return doc.totalMinor - doc.allocatedMinor
}

/**
 * Applies a payment or credit note against an invoice, and records the
 * allocation.
 *
 * `documents.allocatedMinor` is a running total kept on the invoice itself
 * rather than always summed fresh from `allocations` — that denormalisation is
 * what lets "never allocate more than the total" be a MongoDB document
 * validator again (db/indexes.ts), the same way embedding lines is what let
 * the balance check be one. The increment and the bound are the same atomic
 * operation: `findOneAndUpdate` with a `$expr` filter checks the new total
 * against `totalMinor` and applies the `$inc` only if it holds, all in one
 * round trip no other write can land in the middle of. Two concurrent
 * payments racing to settle the same invoice cannot both win — exactly what
 * Postgres's `assert_allocation_within_total` deferred trigger existed to
 * prevent, just enforced as one document's own arithmetic instead of a
 * SUM over a second table.
 */
async function allocateAmount(
  store: Store,
  entityId: string,
  fromDocumentId: string,
  toDocumentId: string,
  amountMinor: Minor,
): Promise<void> {
  const updated = await store.documents.findOneAndUpdate(
    {
      _id: toDocumentId,
      $expr: { $lte: [{ $add: ['$allocatedMinor', amountMinor] }, '$totalMinor'] },
    },
    { $inc: { allocatedMinor: amountMinor } },
    { session: store.session },
  )

  if (!updated) {
    throw new PostingError('Allocated amount would exceed the document total.', 'unbalanced')
  }

  await store.allocations.insertOne(
    {
      _id: newId(),
      entityId,
      fromDocumentId,
      toDocumentId,
      amountMinor,
      allocatedAt: new Date(),
    },
    { session: store.session },
  )
}

/**
 * Posts a payment and allocates it across invoices.
 *
 * Dr Bank / Cr Accounts Receivable. The customer's balance is never a field
 * anywhere — it is the sum of their AR lines, so it cannot disagree with the
 * books.
 */
export async function postPayment(
  store: Store,
  documentId: string,
  targets: Array<{ documentId: string; amountMinor: Minor }>,
  actor: { id?: string | null; email?: string } = {},
) {
  const doc = await requireDraft(store, documentId)

  const period = await requireOpenPeriod(store, doc.entityId, doc.issueDate)
  const number = await takeNextNumber(store, doc.entityId, 'payment', fiscalYearOf(doc.issueDate))

  const bank = await accountByCode(store, doc.entityId, ACCOUNT_CODES.bank)
  const receivable = await accountByCode(store, doc.entityId, ACCOUNT_CODES.receivable)

  const entry = await postJournalEntry(store, {
    entityId: doc.entityId,
    periodId: period._id,
    entryDate: doc.issueDate,
    sourceType: 'payment',
    sourceId: doc._id,
    memo: `Payment ${number}`,
    postedBy: actor.id ?? null,
    lines: [
      { accountId: bank._id, debitMinor: doc.totalMinor },
      { accountId: receivable._id, partyId: doc.partyId, creditMinor: doc.totalMinor },
    ],
  })

  for (const target of targets) {
    if (target.amountMinor <= 0) continue
    await allocateAmount(store, doc.entityId, doc._id, target.documentId, target.amountMinor)
  }

  await store.documents.updateOne(
    { _id: documentId },
    {
      $set: {
        status: 'posted',
        docNumber: number,
        postedAt: new Date(),
        postedBy: actor.id ?? null,
        updatedAt: new Date(),
      },
    },
    { session: store.session },
  )

  await recordAudit(store, {
    entityId: doc.entityId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'post',
    recordType: 'payment',
    recordId: doc._id,
    after: { number, journalEntryId: entry._id },
  })

  await store.outbox.insertOne(
    {
      _id: newId(),
      topic: 'payment.posted',
      payload: { documentId: doc._id, number, totalMinor: doc.totalMinor },
      createdAt: new Date(),
      deliveredAt: null,
      attempts: 0,
      nextAttemptAt: new Date(),
      lastError: '',
    },
    { session: store.session },
  )

  return { number, journalEntryId: entry._id }
}

/** Reverses a posted document with a fresh, opposite entry. */
export async function reverseDocument(
  store: Store,
  documentId: string,
  actor: { id?: string | null; email?: string } = {},
) {
  const doc = await store.documents.findOne({ _id: documentId }, { session: store.session })
  if (!doc) throw new PostingError('That document no longer exists.', 'not_draft')
  if (doc.status !== 'posted') {
    throw new PostingError('Only a posted document can be reversed.', 'not_draft')
  }

  const original = await store.journalEntries.findOne(
    { sourceType: doc.docType, sourceId: doc._id },
    { session: store.session },
  )
  if (!original) throw new PostingError('No ledger entry found for that document.', 'unbalanced')

  const period = await requireOpenPeriod(store, doc.entityId, doc.issueDate)

  const reversal = {
    _id: newId(),
    entityId: doc.entityId,
    periodId: period._id,
    entryDate: doc.issueDate,
    sourceType: `${doc.docType}_reversal`,
    sourceId: doc._id,
    memo: `Reversal of ${doc.docNumber}`,
    reversalOfId: original._id,
    postedAt: new Date(),
    postedBy: actor.id ?? null,
    // Swap the sides. The original entry is left exactly as it was.
    lines: original.lines.map((line, index) => ({
      lineNo: index + 1,
      accountId: line.accountId,
      partyId: line.partyId,
      debitMinor: line.creditMinor,
      creditMinor: line.debitMinor,
      memo: 'reversal',
    })),
  }

  await store.journalEntries.insertOne(reversal, { session: store.session })

  await store.documents.updateOne(
    { _id: documentId },
    { $set: { status: 'voided', voidedAt: new Date(), updatedAt: new Date() } },
    { session: store.session },
  )

  await recordAudit(store, {
    entityId: doc.entityId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'void',
    recordType: 'document',
    recordId: doc._id,
    before: { status: 'posted' },
    after: { status: 'voided', reversalEntryId: reversal._id },
  })

  return { reversalEntryId: reversal._id }
}

/** Builds the embedded `lines` array for a draft, priced and ready to store. */
export function buildDocumentLines(
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
): DocumentLine[] {
  return lines.map((line) => ({
    _id: newId(),
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
    taxes: line.taxes.map((tax) => ({
      component: tax.component,
      ratePercent: tax.ratePercent,
      taxableMinor: tax.taxableMinor,
      amountMinor: tax.amountMinor,
      accountId: null,
    })),
  }))
}
