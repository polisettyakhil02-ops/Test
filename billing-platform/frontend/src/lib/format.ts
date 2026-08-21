/**
 * Display formatting.
 *
 * Money arrives from the API as integer paise and is only ever turned into text
 * here — the browser never does arithmetic on it, so there is nothing for a
 * float to corrupt on the way to the screen.
 */

export function formatMinorIN(minor: number): string {
  const negative = minor < 0
  const abs = Math.abs(minor)
  const whole = String(Math.floor(abs / 100))
  const paise = String(abs % 100).padStart(2, '0')

  let grouped: string
  if (whole.length <= 3) {
    grouped = whole
  } else {
    // Indian grouping: last three, then pairs.
    const last3 = whole.slice(-3)
    grouped = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3
  }

  return `${negative ? '-' : ''}${grouped}.${paise}`
}

export const money = (minor: number) => `${minor < 0 ? '−' : ''}₹${formatMinorIN(Math.abs(minor))}`

/** Paise to the decimal string the API expects back. */
export const toDecimal = (minor: number) => (minor / 100).toFixed(2)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const [y, m, d] = String(value).slice(0, 10).split('-')
  if (!y || !m || !d) return '—'
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toISOString().slice(0, 16).replace('T', ' ')
}

export const today = () => new Date().toISOString().slice(0, 10)

export function startOfMonth(date: string) {
  return `${date.slice(0, 7)}-01`
}

export function endOfMonth(date: string) {
  const [year, month] = date.slice(0, 7).split('-').map(Number)
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
}

export function oneYearBefore(date: string) {
  const shifted = new Date(`${date.slice(0, 10)}T00:00:00Z`)
  shifted.setUTCFullYear(shifted.getUTCFullYear() - 1)
  return shifted.toISOString().slice(0, 10)
}

export const DOC_TYPE_LABELS: Record<string, string> = {
  invoice: 'Invoice',
  credit_note: 'Credit note',
  payment: 'Payment',
}

export type Settlement = 'draft' | 'unpaid' | 'part_paid' | 'paid' | 'overdue' | 'voided'

/** Derived, never stored — the same rule the server applies. */
export function settlementOf(input: {
  status: string
  totalMinor: number
  allocatedMinor: number
  dueDate: string | null
}): Settlement {
  if (input.status === 'draft') return 'draft'
  if (input.status === 'voided') return 'voided'
  if (input.totalMinor - input.allocatedMinor <= 0) return 'paid'
  if (input.dueDate && input.dueDate < today()) return 'overdue'
  return input.allocatedMinor > 0 ? 'part_paid' : 'unpaid'
}

export const SETTLEMENT_LABELS: Record<Settlement, string> = {
  draft: 'Draft',
  unpaid: 'Unpaid',
  part_paid: 'Partly paid',
  paid: 'Paid',
  overdue: 'Overdue',
  voided: 'Voided',
}

export const SETTLEMENT_CLASS: Record<Settlement, string> = {
  draft: 'badge-secondary',
  unpaid: 'badge-outline',
  part_paid: 'badge-warning',
  paid: 'badge-success',
  overdue: 'badge-danger',
  voided: 'badge-secondary',
}

export const STATE_CODES: Array<{ code: string; name: string }> = [
  { code: '01', name: 'Jammu & Kashmir' }, { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' }, { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' }, { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' }, { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' }, { code: '10', name: 'Bihar' },
  { code: '19', name: 'West Bengal' }, { code: '21', name: 'Odisha' },
  { code: '23', name: 'Madhya Pradesh' }, { code: '24', name: 'Gujarat' },
  { code: '27', name: 'Maharashtra' }, { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' }, { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' }, { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
]

export const stateName = (code: string) =>
  STATE_CODES.find((s) => s.code === code)?.name ?? code ?? '—'
