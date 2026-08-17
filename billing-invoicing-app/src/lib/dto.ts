import { formatMinorIN } from '@/domain/money'

/**
 * View models. Rows from Drizzle are already plain objects, so the job here is
 * naming and formatting rather than serialisation.
 */

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  posted: 'Posted',
  voided: 'Voided',
}

export const DOC_TYPE_LABELS: Record<string, string> = {
  invoice: 'Invoice',
  credit_note: 'Credit note',
  payment: 'Payment',
}

export const STATUS_VARIANTS: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'
> = {
  draft: 'secondary',
  posted: 'success',
  voided: 'destructive',
}

/** Derived settlement state — never stored, always computed from allocations. */
export type SettlementState = 'unpaid' | 'part_paid' | 'paid' | 'overdue' | 'draft' | 'voided'

export const SETTLEMENT_LABELS: Record<SettlementState, string> = {
  draft: 'Draft',
  unpaid: 'Unpaid',
  part_paid: 'Partly paid',
  paid: 'Paid',
  overdue: 'Overdue',
  voided: 'Voided',
}

export const SETTLEMENT_VARIANTS: Record<
  SettlementState,
  'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'
> = {
  draft: 'secondary',
  unpaid: 'outline',
  part_paid: 'warning',
  paid: 'success',
  overdue: 'destructive',
  voided: 'secondary',
}

export function settlementOf(input: {
  status: string
  totalMinor: number
  allocatedMinor: number
  dueDate: string | null
  today?: string
}): SettlementState {
  if (input.status === 'draft') return 'draft'
  if (input.status === 'voided') return 'voided'

  const open = input.totalMinor - input.allocatedMinor
  if (open <= 0) return 'paid'

  const today = input.today ?? new Date().toISOString().slice(0, 10)
  if (input.dueDate && input.dueDate < today) return 'overdue'

  return input.allocatedMinor > 0 ? 'part_paid' : 'unpaid'
}

/** ₹ for the browser. The PDF uses formatMoneyPlain — see the note there. */
export function formatMoney(minor: number): string {
  const negative = minor < 0
  return `${negative ? '−' : ''}₹${formatMinorIN(Math.abs(minor))}`
}

/**
 * "INR 1,234.00" for the PDF.
 *
 * PDF base-14 fonts use WinAnsi encoding, which has no rupee sign (U+20B9) --
 * it silently renders as a superscript one. Verified by extracting text from a
 * generated PDF.
 */
export function formatMoneyPlain(minor: number): string {
  const negative = minor < 0
  return `${negative ? '-' : ''}INR ${formatMinorIN(Math.abs(minor))}`
}

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(`${value.slice(0, 10)}T00:00:00Z`) : value
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date)
}

export function formatAddress(address: {
  line1?: string
  line2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
} | null | undefined): string {
  if (!address) return ''
  return [
    address.line1,
    address.line2,
    address.city,
    address.state,
    address.postalCode,
    address.country,
  ]
    .filter(Boolean)
    .join(', ')
}

export function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/** The first day of the month `date` falls in. */
export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`
}

/** The last day of the month `date` falls in. */
export function endOfMonth(date: string): string {
  const [year, month] = date.slice(0, 7).split('-').map(Number)
  // Day 0 of the next month is the last day of this one, and it handles
  // February and leap years without a table.
  const last = new Date(Date.UTC(year, month, 0))
  return last.toISOString().slice(0, 10)
}

/**
 * The same day a year earlier. Goes through Date rather than string surgery so
 * 29 February lands on 28 February instead of on a date that does not exist.
 */
export function oneYearBefore(date: string): string {
  const shifted = new Date(`${date.slice(0, 10)}T00:00:00Z`)
  shifted.setUTCFullYear(shifted.getUTCFullYear() - 1)
  return shifted.toISOString().slice(0, 10)
}

/** A ?page= value, defaulting to 1 for anything that is not a page number. */
export function pageParam(value: unknown): number {
  const page = Number(Array.isArray(value) ? value[0] : value)
  return Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1
}

/** Indian state codes, for the place-of-supply picker that drives GST. */
export const STATE_CODES: Array<{ code: string; name: string }> = [
  { code: '01', name: 'Jammu & Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '19', name: 'West Bengal' },
  { code: '21', name: 'Odisha' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
]

export function stateName(code: string): string {
  return STATE_CODES.find((s) => s.code === code)?.name ?? code
}
