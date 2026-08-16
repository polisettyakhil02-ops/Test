import { and, eq, sql } from 'drizzle-orm'
import { accounts, allocations, documents, journalEntries, journalLines } from '@/db/schema'
import type { Db } from '@/domain/posting'
import type { Minor } from '@/domain/money'

/**
 * Every figure here is derived from the ledger, never from a column on a
 * document. That is the whole point: two reports cannot disagree if they read
 * the same journal lines.
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
  db: Db,
  entityId: string,
  upTo?: string,
): Promise<{ rows: TrialBalanceRow[]; totalDebitMinor: Minor; totalCreditMinor: Minor }> {
  const rows = await db
    .select({
      accountId: accounts.id,
      code: accounts.code,
      name: accounts.name,
      type: accounts.type,
      debit: sql<string>`COALESCE(SUM(${journalLines.debitMinor}), 0)`,
      credit: sql<string>`COALESCE(SUM(${journalLines.creditMinor}), 0)`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
    .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
    .where(
      upTo
        ? and(eq(journalEntries.entityId, entityId), sql`${journalEntries.entryDate} <= ${upTo}`)
        : eq(journalEntries.entityId, entityId),
    )
    .groupBy(accounts.id, accounts.code, accounts.name, accounts.type)
    .orderBy(accounts.code)

  const mapped: TrialBalanceRow[] = rows.map(
    (row: {
      accountId: string
      code: string
      name: string
      type: string
      debit: string
      credit: string
    }) => {
      const debitMinor = Number(row.debit)
      const creditMinor = Number(row.credit)
      // Assets and expenses are debit-natured; the rest are credit-natured.
      const debitNatured = row.type === 'asset' || row.type === 'expense'
      return {
        accountId: row.accountId,
        code: row.code,
        name: row.name,
        type: row.type,
        debitMinor,
        creditMinor,
        balanceMinor: debitNatured ? debitMinor - creditMinor : creditMinor - debitMinor,
      }
    },
  )

  return {
    rows: mapped,
    totalDebitMinor: mapped.reduce((sum, row) => sum + row.debitMinor, 0),
    totalCreditMinor: mapped.reduce((sum, row) => sum + row.creditMinor, 0),
  }
}

/** A customer's outstanding balance, straight from their AR journal lines. */
export async function partyBalanceMinor(
  db: Db,
  entityId: string,
  partyId: string,
): Promise<Minor> {
  const [row] = await db
    .select({
      debit: sql<string>`COALESCE(SUM(${journalLines.debitMinor}), 0)`,
      credit: sql<string>`COALESCE(SUM(${journalLines.creditMinor}), 0)`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
    .where(and(eq(journalEntries.entityId, entityId), eq(journalLines.partyId, partyId)))

  return Number(row?.debit ?? 0) - Number(row?.credit ?? 0)
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
export async function ageingReport(
  db: Db,
  entityId: string,
  asOf: string,
): Promise<AgeingRow[]> {
  const rows = await db.execute(sql`
    SELECT d.id,
           d.doc_number,
           d.party_id,
           d.party_snapshot ->> 'name' AS party_name,
           d.issue_date,
           d.due_date,
           d.total_minor,
           COALESCE(a.allocated, 0) AS allocated
      FROM ${documents} d
      LEFT JOIN (
            SELECT to_document_id, SUM(amount_minor) AS allocated
              FROM ${allocations}
             GROUP BY to_document_id
           ) a ON a.to_document_id = d.id
     WHERE d.entity_id = ${entityId}
       AND d.doc_type = 'invoice'
       AND d.status = 'posted'
       AND d.total_minor > COALESCE(a.allocated, 0)
     ORDER BY d.issue_date
  `)

  const asOfMs = Date.parse(`${asOf}T00:00:00Z`)

  return (rows.rows ?? rows).map(
    (row: Record<string, unknown>): AgeingRow => {
      const totalMinor = Number(row.total_minor)
      const allocatedMinor = Number(row.allocated)
      const dueDate = (row.due_date as string | null) ?? null
      const daysOverdue = dueDate
        ? Math.floor((asOfMs - Date.parse(`${dueDate}T00:00:00Z`)) / 86_400_000)
        : 0

      return {
        documentId: String(row.id),
        docNumber: (row.doc_number as string | null) ?? null,
        partyId: String(row.party_id),
        partyName: String(row.party_name ?? ''),
        issueDate: String(row.issue_date),
        dueDate,
        totalMinor,
        allocatedMinor,
        openMinor: totalMinor - allocatedMinor,
        daysOverdue: Math.max(daysOverdue, 0),
        bucket: bucketFor(daysOverdue),
      }
    },
  )
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
export async function dashboardTotals(
  db: Db,
  entityId: string,
  asOf: string,
): Promise<DashboardTotals> {
  const tb = await trialBalance(db, entityId)

  const sumByType = (type: string) =>
    tb.rows.filter((row) => row.type === type).reduce((sum, row) => sum + row.balanceMinor, 0)

  const receivableMinor = tb.rows
    .filter((row) => row.code === '1100')
    .reduce((sum, row) => sum + row.balanceMinor, 0)

  const taxPayableMinor = tb.rows
    .filter((row) => row.code === '2200')
    .reduce((sum, row) => sum + row.balanceMinor, 0)

  const ageing = await ageingReport(db, entityId, asOf)
  const overdue = ageing.filter((row) => row.bucket !== 'current')

  const [counts] = await db
    .select({
      drafts: sql<string>`COUNT(*) FILTER (WHERE ${documents.status} = 'draft')`,
    })
    .from(documents)
    .where(and(eq(documents.entityId, entityId), eq(documents.docType, 'invoice')))

  return {
    revenueMinor: sumByType('income'),
    receivableMinor,
    taxPayableMinor,
    openInvoiceCount: ageing.length,
    overdueCount: overdue.length,
    overdueMinor: overdue.reduce((sum, row) => sum + row.openMinor, 0),
    draftCount: Number(counts?.drafts ?? 0),
  }
}

/** Profit and loss for a date range, from income and expense accounts. */
export async function profitAndLoss(db: Db, entityId: string, from: string, to: string) {
  const rows = await db
    .select({
      code: accounts.code,
      name: accounts.name,
      type: accounts.type,
      debit: sql<string>`COALESCE(SUM(${journalLines.debitMinor}), 0)`,
      credit: sql<string>`COALESCE(SUM(${journalLines.creditMinor}), 0)`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
    .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
    .where(
      and(
        eq(journalEntries.entityId, entityId),
        sql`${journalEntries.entryDate} >= ${from}`,
        sql`${journalEntries.entryDate} <= ${to}`,
        sql`${accounts.type} IN ('income', 'expense')`,
      ),
    )
    .groupBy(accounts.code, accounts.name, accounts.type)
    .orderBy(accounts.code)

  const income = rows
    .filter((r: { type: string }) => r.type === 'income')
    .map((r: { code: string; name: string; debit: string; credit: string }) => ({
      code: r.code,
      name: r.name,
      amountMinor: Number(r.credit) - Number(r.debit),
    }))

  const expenses = rows
    .filter((r: { type: string }) => r.type === 'expense')
    .map((r: { code: string; name: string; debit: string; credit: string }) => ({
      code: r.code,
      name: r.name,
      amountMinor: Number(r.debit) - Number(r.credit),
    }))

  const incomeMinor = income.reduce((s: number, r: { amountMinor: number }) => s + r.amountMinor, 0)
  const expenseMinor = expenses.reduce(
    (s: number, r: { amountMinor: number }) => s + r.amountMinor,
    0,
  )

  return { income, expenses, incomeMinor, expenseMinor, netMinor: incomeMinor - expenseMinor }
}
