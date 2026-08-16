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
