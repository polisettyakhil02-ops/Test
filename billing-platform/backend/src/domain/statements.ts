import { sql } from 'drizzle-orm'
import { ACCOUNT_CODES, type Db } from '@/domain/posting'
import type { Minor } from '@/domain/money'

/**
 * Customer statements.
 *
 * A statement is not a list of invoices -- it is the customer's receivable
 * account, read straight off the ledger. Building it from documents would let it
 * disagree with the trial balance the moment anything is voided or allocated;
 * building it from AR journal lines means it cannot.
 *
 * The columns are the ones a customer's accounts-payable clerk expects: what
 * they owed before the period, what moved, and what they owe now.
 */

export interface StatementRow {
  entryId: string
  date: string
  sourceType: string
  documentId: string | null
  docNumber: string | null
  memo: string
  /** An invoice raised against them. */
  debitMinor: Minor
  /** A payment or credit note in their favour. */
  creditMinor: Minor
  balanceMinor: Minor
}

export interface Statement {
  from: string
  to: string
  openingMinor: Minor
  closingMinor: Minor
  chargedMinor: Minor
  settledMinor: Minor
  rows: StatementRow[]
}

/**
 * Movements on one party's receivable account between two dates.
 *
 * Scoped to the receivable account rather than to every line carrying the party
 * id, so a future expense or vendor posting tagged with the same party cannot
 * leak into what is meant to be a receivables statement.
 */
export async function customerStatement(
  db: Db,
  entityId: string,
  partyId: string,
  period: { from: string; to: string },
): Promise<Statement> {
  const opening = await db.execute(sql`
    SELECT COALESCE(SUM(jl.debit_minor), 0) - COALESCE(SUM(jl.credit_minor), 0) AS balance
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.entry_id
      JOIN accounts a        ON a.id = jl.account_id
     WHERE je.entity_id = ${entityId}
       AND jl.party_id  = ${partyId}
       AND a.code       = ${ACCOUNT_CODES.receivable}
       AND je.entry_date < ${period.from}
  `).then(unwrap)

  const movements: Array<Record<string, unknown>> = await db
    .execute(sql`
      SELECT je.id            AS entry_id,
             je.entry_date,
             je.source_type,
             je.source_id,
             je.memo,
             d.doc_number,
             jl.debit_minor,
             jl.credit_minor
        FROM journal_lines jl
        JOIN journal_entries je ON je.id = jl.entry_id
        JOIN accounts a         ON a.id = jl.account_id
        LEFT JOIN documents d   ON d.id = je.source_id
       WHERE je.entity_id = ${entityId}
         AND jl.party_id  = ${partyId}
         AND a.code       = ${ACCOUNT_CODES.receivable}
         AND je.entry_date >= ${period.from}
         AND je.entry_date <= ${period.to}
       ORDER BY je.entry_date, je.posted_at, jl.line_no
    `)
    .then(rowsOf)

  let running = Number(opening?.balance ?? 0)
  const openingMinor = running
  let chargedMinor = 0
  let settledMinor = 0

  const rows: StatementRow[] = movements.map((row) => {
    const debitMinor = Number(row.debit_minor)
    const creditMinor = Number(row.credit_minor)
    running += debitMinor - creditMinor
    chargedMinor += debitMinor
    settledMinor += creditMinor

    return {
      entryId: String(row.entry_id),
      date: String(row.entry_date),
      sourceType: String(row.source_type),
      documentId: (row.source_id as string | null) ?? null,
      docNumber: (row.doc_number as string | null) ?? null,
      memo: String(row.memo ?? ''),
      debitMinor,
      creditMinor,
      balanceMinor: running,
    }
  })

  return {
    from: period.from,
    to: period.to,
    openingMinor,
    closingMinor: running,
    chargedMinor,
    settledMinor,
    rows,
  }
}

/** postgres-js returns an array; pglite returns { rows }. */
function rowsOf(result: unknown): Array<Record<string, unknown>> {
  const maybe = result as { rows?: Array<Record<string, unknown>> }
  return (maybe?.rows ?? (result as Array<Record<string, unknown>>)) ?? []
}

function unwrap(result: unknown): Record<string, unknown> | undefined {
  return rowsOf(result)[0]
}

/** The statement as CSV, for emailing to a customer who wants the detail. */
export function statementToCsv(statement: Statement, partyName: string): string {
  const cell = (value: string | number) => {
    const text = String(value)
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }

  const money = (minor: Minor) => (minor / 100).toFixed(2)

  const lines = [
    `Statement of account,${cell(partyName)}`,
    `Period,${statement.from} to ${statement.to}`,
    '',
    ['Date', 'Reference', 'Description', 'Charges', 'Payments', 'Balance'].join(','),
    ['', '', 'Opening balance', '', '', money(statement.openingMinor)].map(cell).join(','),
    ...statement.rows.map((row) =>
      [
        row.date,
        row.docNumber ?? '',
        row.memo,
        row.debitMinor ? money(row.debitMinor) : '',
        row.creditMinor ? money(row.creditMinor) : '',
        money(row.balanceMinor),
      ]
        .map(cell)
        .join(','),
    ),
    ['', '', 'Closing balance', '', '', money(statement.closingMinor)].map(cell).join(','),
  ]

  return lines.join('\n')
}
