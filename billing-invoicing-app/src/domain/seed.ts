import { newId } from '@/db/ids'
import type { AccountType, Store } from '@/db/collections'
import { ACCOUNT_CODES, fiscalYearOf } from '@/domain/posting'

/** A minimal chart of accounts sufficient to run sales and receipts. */
export const DEFAULT_ACCOUNTS: Array<{ code: string; name: string; type: AccountType }> = [
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
  store: Store,
  input: { name: string; stateCode?: string; gstin?: string; startYear?: number },
) {
  const entity = {
    _id: newId(),
    name: input.name,
    legalName: input.name,
    gstin: input.gstin ?? '',
    stateCode: input.stateCode ?? '29',
    addressLines: [],
    email: '',
    phone: '',
    bankDetails: '',
    functionalCurrency: 'INR',
    createdAt: new Date(),
  }
  await store.entities.insertOne(entity, { session: store.session })

  await store.accounts.insertMany(
    DEFAULT_ACCOUNTS.map((account) => ({
      _id: newId(),
      entityId: entity._id,
      code: account.code,
      name: account.name,
      type: account.type,
      parentId: null,
      isPostable: true,
      isActive: true,
    })),
    { session: store.session },
  )

  const startYear = input.startYear ?? new Date().getUTCFullYear()

  await store.accountingPeriods.insertMany(
    monthlyPeriods(startYear).map((p) => ({
      _id: newId(),
      entityId: entity._id,
      name: p.name,
      startsOn: p.startsOn,
      endsOn: p.endsOn,
      state: 'open' as const,
      closedAt: null,
      closedBy: null,
    })),
    { session: store.session },
  )

  const fy = fiscalYearOf(`${startYear}-04-01`)
  await store.numberSeries.insertMany(
    (
      [
        ['invoice', 'INV-'],
        ['credit_note', 'CRN-'],
        ['payment', 'PAY-'],
      ] as const
    ).map(([docType, prefix]) => ({
      _id: newId(),
      entityId: entity._id,
      docType,
      fiscalYear: fy,
      prefix,
      padding: 5,
      nextValue: 1,
    })),
    { session: store.session },
  )

  return entity
}
