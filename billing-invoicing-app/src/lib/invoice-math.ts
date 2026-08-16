/**
 * Invoice arithmetic, deliberately free of any Mongoose import.
 *
 * The invoice form previews totals live in the browser, and it must use the
 * exact same arithmetic the database will apply on save -- two implementations
 * would eventually disagree by a rupee and nobody would know which is right.
 * Importing this from `models/Invoice.ts` would drag Mongoose into the client
 * bundle, so the maths lives here and the model imports it, not the reverse.
 */

export const INVOICE_STATUSES = [
  'draft',
  'sent',
  'paid',
  'partially_paid',
  'overdue',
  'cancelled',
] as const

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

export type DiscountType = 'percentage' | 'fixed'

/** The per-line inputs the maths reads. */
export interface CalcLine {
  quantity: number
  unitPrice: number
  taxRate: number
  lineSubtotal: number
  lineDiscount: number
  lineTaxAmount: number
  lineTotal: number
}

export interface CalcInput {
  lineItems: CalcLine[]
  discountType: DiscountType
  discountValue: number
  amountPaid: number
}

export interface InvoiceTotals {
  subtotal: number
  discountAmount: number
  taxAmount: number
  total: number
  amountDue: number
}

/** Money helper: JS floats can't hold 0.1 + 0.2, so round at every boundary. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/**
 * Recomputes every derived money field from quantity, unitPrice, taxRate and
 * the invoice-level discount. Mutates and returns the object passed in, so it
 * works on both a plain form-state object and a Mongoose document.
 *
 * An invoice-level discount is apportioned across lines in proportion to each
 * line's subtotal, and tax is charged on the post-discount amount -- taxing the
 * pre-discount value would overstate GST on every discounted invoice.
 */
export function recalculateInvoice<T extends CalcInput>(invoice: T): T & InvoiceTotals {
  const lines = invoice.lineItems ?? []

  for (const line of lines) {
    line.lineSubtotal = round2((line.quantity || 0) * (line.unitPrice || 0))
  }

  const subtotal = round2(lines.reduce((sum, line) => sum + line.lineSubtotal, 0))

  const rawDiscount =
    invoice.discountType === 'percentage'
      ? round2((subtotal * (invoice.discountValue || 0)) / 100)
      : round2(invoice.discountValue || 0)

  // Never discount below zero.
  const discountAmount = Math.min(Math.max(rawDiscount, 0), subtotal)

  let allocatedDiscount = 0

  lines.forEach((line, index) => {
    const isLast = index === lines.length - 1

    // Apportion by share of subtotal, but give the final line whatever cents
    // are left so the per-line discounts always sum to discountAmount exactly.
    const lineDiscount = isLast
      ? round2(discountAmount - allocatedDiscount)
      : round2(subtotal > 0 ? (discountAmount * line.lineSubtotal) / subtotal : 0)

    allocatedDiscount = round2(allocatedDiscount + lineDiscount)

    const taxable = round2(line.lineSubtotal - lineDiscount)

    line.lineDiscount = lineDiscount
    line.lineTaxAmount = round2((taxable * (line.taxRate || 0)) / 100)
    line.lineTotal = round2(taxable + line.lineTaxAmount)
  })

  const taxAmount = round2(lines.reduce((sum, line) => sum + line.lineTaxAmount, 0))
  const total = round2(subtotal - discountAmount + taxAmount)

  const target = invoice as T & InvoiceTotals
  target.subtotal = subtotal
  target.discountAmount = discountAmount
  target.taxAmount = taxAmount
  target.total = total
  target.amountDue = round2(total - (invoice.amountPaid || 0))

  return target
}

/**
 * Keeps the stored status consistent with what has actually been paid.
 *
 * `draft` and `cancelled` are left untouched -- they are deliberate states that
 * say nothing about payment. Everything else is derived, so an invoice cannot
 * sit at "sent" while fully paid.
 */
export function derivePaymentStatus(
  status: InvoiceStatus,
  total: number,
  amountPaid: number,
  dueDate: Date | null,
  now: Date = new Date(),
): InvoiceStatus {
  if (status === 'draft' || status === 'cancelled') {
    return status
  }

  if (amountPaid >= total && total > 0) {
    return 'paid'
  }

  if (amountPaid > 0) {
    return 'partially_paid'
  }

  if (dueDate && dueDate.getTime() < now.getTime()) {
    return 'overdue'
  }

  return 'sent'
}

/** Groups tax by rate for the GST summary on the invoice and its PDF. */
export function taxBreakdown(
  lines: Array<Pick<CalcLine, 'taxRate' | 'lineTaxAmount' | 'lineSubtotal' | 'lineDiscount'>>,
): Array<{ rate: number; taxable: number; tax: number }> {
  const byRate = new Map<number, { rate: number; taxable: number; tax: number }>()

  for (const line of lines) {
    const rate = line.taxRate || 0
    const existing = byRate.get(rate) ?? { rate, taxable: 0, tax: 0 }

    existing.taxable = round2(
      existing.taxable + round2(line.lineSubtotal - line.lineDiscount),
    )
    existing.tax = round2(existing.tax + line.lineTaxAmount)
    byRate.set(rate, existing)
  }

  return [...byRate.values()].sort((a, b) => a.rate - b.rate)
}
