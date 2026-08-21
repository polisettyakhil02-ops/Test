import { ACCOUNT_CODES } from '@/domain/posting'
import type { Store } from '@/db/collections'
import type { Minor } from '@/domain/money'

/**
 * Every figure here is derived from the ledger, never from a field on a
 * document. That is the whole point: two reports cannot disagree if they read
 * the same journal lines. The aggregation pipelines below are the Mongo
 * equivalent of the SQL joins the Postgres version ran — `$unwind` turns each
 * journal entry's embedded lines back into one row per line, which is exactly
 * what joining `journal_lines` to `journal_entries` used to produce.
 */

export interface TrialBalanceRow {
  accountId: string
  code: string
  name: string
  type: string
  debitMinor: Minor
  creditMinor: Minor
  balanceMinor: Minor
}

export async function trialBalance(
  store: Store,
  entityId: string,
  upTo?: string,
): Promise<{ rows: TrialBalanceRow[]; totalDebitMinor: Minor; totalCreditMinor: Minor }> {
  const rows = await store.journalEntries
    .aggregate<{
      accountId: string
      code: string
      name: string
      type: string
      debit: number
      credit: number
    }>(
      [
        { $match: { entityId, ...(upTo ? { entryDate: { $lte: upTo } } : {}) } },
        { $unwind: '$lines' },
        {
          $group: {
            _id: '$lines.accountId',
            debit: { $sum: '$lines.debitMinor' },
            credit: { $sum: '$lines.creditMinor' },
          },
        },
        { $lookup: { from: 'accounts', localField: '_id', foreignField: '_id', as: 'account' } },
        { $unwind: '$account' },
        {
          $project: {
            _id: 0,
            accountId: '$_id',
            code: '$account.code',
            name: '$account.name',
            type: '$account.type',
            debit: 1,
            credit: 1,
          },
        },
        { $sort: { code: 1 } },
      ],
      { session: store.session },
    )
    .toArray()

  const mapped: TrialBalanceRow[] = rows.map((row) => {
    // Assets and expenses are debit-natured; the rest are credit-natured.
    const debitNatured = row.type === 'asset' || row.type === 'expense'
    return {
      accountId: row.accountId,
      code: row.code,
      name: row.name,
      type: row.type,
      debitMinor: row.debit,
      creditMinor: row.credit,
      balanceMinor: debitNatured ? row.debit - row.credit : row.credit - row.debit,
    }
  })

  return {
    rows: mapped,
    totalDebitMinor: mapped.reduce((sum, row) => sum + row.debitMinor, 0),
    totalCreditMinor: mapped.reduce((sum, row) => sum + row.creditMinor, 0),
  }
}

/** A customer's outstanding balance, straight from their AR journal lines. */
export async function partyBalanceMinor(store: Store, entityId: string, partyId: string): Promise<Minor> {
  const [row] = await store.journalEntries
    .aggregate<{ debit: number; credit: number }>(
      [
        { $match: { entityId, 'lines.partyId': partyId } },
        { $unwind: '$lines' },
        { $match: { 'lines.partyId': partyId } },
        {
          $group: {
            _id: null,
            debit: { $sum: '$lines.debitMinor' },
            credit: { $sum: '$lines.creditMinor' },
          },
        },
      ],
      { session: store.session },
    )
    .toArray()

  return (row?.debit ?? 0) - (row?.credit ?? 0)
}

export interface AgeingRow {
  documentId: string
  docNumber: string | null
  partyId: string
  partyName: string
  issueDate: string
  dueDate: string | null
  totalMinor: Minor
  allocatedMinor: Minor
  openMinor: Minor
  daysOverdue: number
  bucket: 'current' | '1-30' | '31-60' | '61-90' | '90+'
}

function bucketFor(daysOverdue: number): AgeingRow['bucket'] {
  if (daysOverdue <= 0) return 'current'
  if (daysOverdue <= 30) return '1-30'
  if (daysOverdue <= 60) return '31-60'
  if (daysOverdue <= 90) return '61-90'
  return '90+'
}

/** Open invoices with their age. Buckets are derived, never stored. */
export async function ageingReport(store: Store, entityId: string, asOf: string): Promise<AgeingRow[]> {
  const rows = await store.documents
    .find(
      {
        entityId,
        docType: 'invoice',
        status: 'posted',
        $expr: { $gt: ['$totalMinor', '$allocatedMinor'] },
      },
      {
        session: store.session,
        sort: { issueDate: 1 },
        projection: {
          docNumber: 1,
          partyId: 1,
          partySnapshot: 1,
          issueDate: 1,
          dueDate: 1,
          totalMinor: 1,
          allocatedMinor: 1,
        },
      },
    )
    .toArray()

  const asOfMs = Date.parse(`${asOf}T00:00:00Z`)

  return rows.map((row): AgeingRow => {
    const daysOverdue = row.dueDate
      ? Math.floor((asOfMs - Date.parse(`${row.dueDate}T00:00:00Z`)) / 86_400_000)
      : 0

    return {
      documentId: row._id,
      docNumber: row.docNumber,
      partyId: row.partyId,
      partyName: row.partySnapshot?.name ?? '',
      issueDate: row.issueDate,
      dueDate: row.dueDate,
      totalMinor: row.totalMinor,
      allocatedMinor: row.allocatedMinor,
      openMinor: row.totalMinor - row.allocatedMinor,
      daysOverdue: Math.max(daysOverdue, 0),
      bucket: bucketFor(daysOverdue),
    }
  })
}

export interface DashboardTotals {
  revenueMinor: Minor
  receivableMinor: Minor
  taxPayableMinor: Minor
  openInvoiceCount: number
  overdueCount: number
  overdueMinor: Minor
  draftCount: number
}

/**
 * Dashboard figures, all from the ledger except the document counts.
 *
 * Revenue is the balance of income accounts, so a credit note reduces it
 * automatically — no special case, no second code path to keep in step.
 */
export async function dashboardTotals(store: Store, entityId: string, asOf: string): Promise<DashboardTotals> {
  const tb = await trialBalance(store, entityId)

  const sumByType = (type: string) =>
    tb.rows.filter((row) => row.type === type).reduce((sum, row) => sum + row.balanceMinor, 0)

  const receivableMinor = tb.rows
    .filter((row) => row.code === ACCOUNT_CODES.receivable)
    .reduce((sum, row) => sum + row.balanceMinor, 0)

  const taxPayableMinor = tb.rows
    .filter((row) => row.code === ACCOUNT_CODES.gstOutput)
    .reduce((sum, row) => sum + row.balanceMinor, 0)

  const ageing = await ageingReport(store, entityId, asOf)
  const overdue = ageing.filter((row) => row.bucket !== 'current')

  const draftCount = await store.documents.countDocuments(
    { entityId, docType: 'invoice', status: 'draft' },
    { session: store.session },
  )

  return {
    revenueMinor: sumByType('income'),
    receivableMinor,
    taxPayableMinor,
    openInvoiceCount: ageing.length,
    overdueCount: overdue.length,
    overdueMinor: overdue.reduce((sum, row) => sum + row.openMinor, 0),
    draftCount,
  }
}

/** Profit and loss for a date range, from income and expense accounts. */
export async function profitAndLoss(store: Store, entityId: string, from: string, to: string) {
  const rows = await store.journalEntries
    .aggregate<{ code: string; name: string; type: string; debit: number; credit: number }>(
      [
        { $match: { entityId, entryDate: { $gte: from, $lte: to } } },
        { $unwind: '$lines' },
        {
          $group: {
            _id: '$lines.accountId',
            debit: { $sum: '$lines.debitMinor' },
            credit: { $sum: '$lines.creditMinor' },
          },
        },
        { $lookup: { from: 'accounts', localField: '_id', foreignField: '_id', as: 'account' } },
        { $unwind: '$account' },
        { $match: { 'account.type': { $in: ['income', 'expense'] } } },
        {
          $project: {
            _id: 0,
            code: '$account.code',
            name: '$account.name',
            type: '$account.type',
            debit: 1,
            credit: 1,
          },
        },
        { $sort: { code: 1 } },
      ],
      { session: store.session },
    )
    .toArray()

  const income = rows
    .filter((r) => r.type === 'income')
    .map((r) => ({ code: r.code, name: r.name, amountMinor: r.credit - r.debit }))

  const expenses = rows
    .filter((r) => r.type === 'expense')
    .map((r) => ({ code: r.code, name: r.name, amountMinor: r.debit - r.credit }))

  const incomeMinor = income.reduce((s, r) => s + r.amountMinor, 0)
  const expenseMinor = expenses.reduce((s, r) => s + r.amountMinor, 0)

  return { income, expenses, incomeMinor, expenseMinor, netMinor: incomeMinor - expenseMinor }
}
