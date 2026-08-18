import { accountingPeriods, accounts, entities, numberSeries } from '@/db/schema'
import type { Db } from '@/domain/posting'
import { ACCOUNT_CODES, fiscalYearOf } from '@/domain/posting'

/** A minimal chart of accounts sufficient to run sales and receipts. */
export const DEFAULT_ACCOUNTS: Array<{
  code: string
  name: string
  type: 'asset' | 'liability' | 'equity' | 'income' | 'expense'
}> = [
  { code: ACCOUNT_CODES.bank, name: 'Bank', type: 'asset' },
  { code: ACCOUNT_CODES.receivable, name: 'Accounts Receivable', type: 'asset' },
  { code: '2000', name: 'Accounts Payable', type: 'liability' },
  { code: ACCOUNT_CODES.gstOutput, name: 'GST Output Payable', type: 'liability' },
  { code: '3000', name: 'Owner Equity', type: 'equity' },
  { code: ACCOUNT_CODES.sales, name: 'Sales', type: 'income' },
  { code: '4100', name: 'Services', type: 'income' },
  { code: '5000', name: 'General Expenses', type: 'expense' },
]

/** Twelve monthly periods starting at the given fiscal-year April. */
export function monthlyPeriods(startYear: number) {
  return Array.from({ length: 12 }, (_, index) => {
    const month = ((3 + index) % 12) + 1
    const year = startYear + (3 + index >= 12 ? 1 : 0)
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
    const end = `${year}-${String(month).padStart(2, '0')}-${endDay}`
    const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en', {
      month: 'short',
      timeZone: 'UTC',
    })
    return { name: `${label} ${year}`, startsOn: start, endsOn: end }
  })
}

export async function seedEntity(
  db: Db,
  input: { name: string; stateCode?: string; gstin?: string; startYear?: number },
) {
  const [entity] = await db
    .insert(entities)
    .values({
      name: input.name,
      legalName: input.name,
      stateCode: input.stateCode ?? '29',
      gstin: input.gstin ?? '',
    })
    .returning()

  await db
    .insert(accounts)
    .values(DEFAULT_ACCOUNTS.map((account) => ({ ...account, entityId: entity.id })))

  const startYear = input.startYear ?? new Date().getUTCFullYear()

  await db
    .insert(accountingPeriods)
    .values(monthlyPeriods(startYear).map((p) => ({ ...p, entityId: entity.id })))

  const fy = fiscalYearOf(`${startYear}-04-01`)
  await db.insert(numberSeries).values([
    { entityId: entity.id, docType: 'invoice', fiscalYear: fy, prefix: 'INV-' },
    { entityId: entity.id, docType: 'credit_note', fiscalYear: fy, prefix: 'CRN-' },
    { entityId: entity.id, docType: 'payment', fiscalYear: fy, prefix: 'PAY-' },
  ])

  return entity
}
