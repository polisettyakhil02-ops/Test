import { ACCOUNT_CODES } from '@/domain/posting'
import type { Store } from '@/db/collections'
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

interface MovementRow {
  entryId: string
  entryDate: string
  postedAt: Date
  sourceType: string
  sourceId: string | null
  memo: string
  docNumber: string | null
  debitMinor: number
  creditMinor: number
  lineNo: number
}

/**
 * Movements on one party's receivable account between two dates.
 *
 * Scoped to the receivable account rather than to every line carrying the party
 * id, so a future expense or vendor posting tagged with the same party cannot
 * leak into what is meant to be a receivables statement.
 */
async function movements(
  store: Store,
  entityId: string,
  partyId: string,
  match: Record<string, unknown>,
): Promise<MovementRow[]> {
  return store.journalEntries
    .aggregate<MovementRow>(
      [
        { $match: { entityId, 'lines.partyId': partyId, ...match } },
        { $unwind: '$lines' },
        { $match: { 'lines.partyId': partyId } },
        { $lookup: { from: 'accounts', localField: 'lines.accountId', foreignField: '_id', as: 'account' } },
        { $unwind: '$account' },
        { $match: { 'account.code': ACCOUNT_CODES.receivable } },
        { $lookup: { from: 'documents', localField: 'sourceId', foreignField: '_id', as: 'doc' } },
        {
          $project: {
            _id: 0,
            entryId: '$_id',
            entryDate: 1,
            postedAt: 1,
            sourceType: 1,
            sourceId: 1,
            memo: 1,
            docNumber: { $ifNull: [{ $arrayElemAt: ['$doc.docNumber', 0] }, null] },
            debitMinor: '$lines.debitMinor',
            creditMinor: '$lines.creditMinor',
            lineNo: '$lines.lineNo',
          },
        },
        { $sort: { entryDate: 1, postedAt: 1, lineNo: 1 } },
      ],
      { session: store.session },
    )
    .toArray()
}

export async function customerStatement(
  store: Store,
  entityId: string,
  partyId: string,
  period: { from: string; to: string },
): Promise<Statement> {
  const before = await movements(store, entityId, partyId, { entryDate: { $lt: period.from } })
  const openingMinor = before.reduce((sum, row) => sum + (row.debitMinor - row.creditMinor), 0)

  const inPeriod = await movements(store, entityId, partyId, {
    entryDate: { $gte: period.from, $lte: period.to },
  })

  let running = openingMinor
  let chargedMinor = 0
  let settledMinor = 0

  const rows: StatementRow[] = inPeriod.map((row) => {
    running += row.debitMinor - row.creditMinor
    chargedMinor += row.debitMinor
    settledMinor += row.creditMinor

    return {
      entryId: row.entryId,
      date: row.entryDate,
      sourceType: row.sourceType,
      documentId: row.sourceId,
      docNumber: row.docNumber,
      memo: row.memo ?? '',
      debitMinor: row.debitMinor,
      creditMinor: row.creditMinor,
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
