import { formatMinorIN } from '@/domain/money'

/**
 * Formatting the API and the PDF both need.
 *
 * The browser formats its own money — this exists for the PDF, which is
 * rendered server-side, and for CSV exports.
 */

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

export function formatAddress(
  address:
    | { line1?: string; line2?: string; city?: string; state?: string; postalCode?: string; country?: string }
    | null
    | undefined,
): string {
  if (!address) return ''
  return [address.line1, address.line2, address.city, address.state, address.postalCode, address.country]
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
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
}

/**
 * The same day a year earlier. Goes through Date rather than string surgery so
 * 29 February lands on a date that exists.
 */
export function oneYearBefore(date: string): string {
  const shifted = new Date(`${date.slice(0, 10)}T00:00:00Z`)
  shifted.setUTCFullYear(shifted.getUTCFullYear() - 1)
  return shifted.toISOString().slice(0, 10)
}
