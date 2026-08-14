import { Schema, model, models, Types, type Model, type HydratedDocument } from 'mongoose'
import { nextSequence } from '@/models/Counter'

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

export interface IInvoiceLineItem {
  item: Types.ObjectId | null
  // Snapshot fields. Copied from the Item at the moment the line is added so
  // that editing or deleting an item later never rewrites a sent invoice.
  description: string
  hsnSac: string
  unit: string
  quantity: number
  unitPrice: number
  taxRate: number
  // Derived by the pre-validate hook below. Never set these by hand.
  lineSubtotal: number
  lineDiscount: number
  lineTaxAmount: number
  lineTotal: number
}

export interface IInvoice {
  invoiceNumber: string
  client: Types.ObjectId
  clientSnapshot: {
    name: string
    email: string
    phone: string
    gstin: string
    address: string
  }
  issueDate: Date
  dueDate: Date | null
  status: InvoiceStatus
  lineItems: IInvoiceLineItem[]
  discountType: DiscountType
  discountValue: number
  subtotal: number
  discountAmount: number
  taxAmount: number
  total: number
  amountPaid: number
  amountDue: number
  notes: string
  terms: string
  createdAt: Date
  updatedAt: Date
}

/** Money helper: JS floats can't hold 0.1 + 0.2, so round at every boundary. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

const LineItemSchema = new Schema<IInvoiceLineItem>(
  {
    item: { type: Schema.Types.ObjectId, ref: 'Item', default: null },
    description: {
      type: String,
      required: [true, 'Line item description is required'],
      trim: true,
    },
    hsnSac: { type: String, trim: true, default: '' },
    unit: { type: String, trim: true, default: 'unit' },
    quantity: {
      type: Number,
      required: true,
      min: [0, 'Quantity cannot be negative'],
      default: 1,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: [0, 'Unit price cannot be negative'],
      default: 0,
    },
    taxRate: {
      type: Number,
      min: [0, 'Tax rate cannot be negative'],
      max: [100, 'Tax rate cannot exceed 100'],
      default: 0,
    },
    lineSubtotal: { type: Number, default: 0 },
    lineDiscount: { type: Number, default: 0 },
    lineTaxAmount: { type: Number, default: 0 },
    lineTotal: { type: Number, default: 0 },
  },
  { _id: true },
)

const InvoiceSchema = new Schema<IInvoice>(
  {
    invoiceNumber: {
      type: String,
      unique: true,
      trim: true,
      uppercase: true,
    },
    client: {
      type: Schema.Types.ObjectId,
      ref: 'Client',
      required: [true, 'An invoice must belong to a client'],
    },
    clientSnapshot: {
      name: { type: String, trim: true, default: '' },
      email: { type: String, trim: true, default: '' },
      phone: { type: String, trim: true, default: '' },
      gstin: { type: String, trim: true, default: '' },
      address: { type: String, trim: true, default: '' },
    },
    issueDate: { type: Date, default: () => new Date() },
    dueDate: { type: Date, default: null },
    status: {
      type: String,
      enum: INVOICE_STATUSES,
      default: 'draft',
    },
    lineItems: {
      type: [LineItemSchema],
      default: [],
    },
    discountType: {
      type: String,
      enum: ['percentage', 'fixed'],
      default: 'fixed',
    },
    discountValue: {
      type: Number,
      min: [0, 'Discount cannot be negative'],
      default: 0,
    },
    subtotal: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    amountPaid: {
      type: Number,
      min: [0, 'Amount paid cannot be negative'],
      default: 0,
    },
    amountDue: { type: Number, default: 0 },
    notes: { type: String, trim: true, default: '' },
    terms: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
)

InvoiceSchema.index({ client: 1, issueDate: -1 })
InvoiceSchema.index({ status: 1 })

/**
 * Recomputes every derived money field from quantity, unitPrice, taxRate and
 * the invoice-level discount. Exported so the UI can show a live preview using
 * exactly the same arithmetic the database will apply on save.
 *
 * An invoice-level discount is apportioned across lines in proportion to each
 * line's subtotal, and tax is charged on the post-discount amount -- taxing the
 * pre-discount value would overstate GST on every discounted invoice.
 */
/** The fields recalculateInvoice reads. */
export type InvoiceCalcInput = Pick<
  IInvoice,
  'lineItems' | 'discountType' | 'discountValue' | 'amountPaid'
>

/** The fields recalculateInvoice writes. */
export type InvoiceTotals = Pick<
  IInvoice,
  'subtotal' | 'discountAmount' | 'taxAmount' | 'total' | 'amountDue'
>

export function recalculateInvoice<T extends InvoiceCalcInput>(
  invoice: T,
): T & InvoiceTotals {
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

InvoiceSchema.pre('validate', async function (this: HydratedDocument<IInvoice>) {
  if (!this.invoiceNumber) {
    const seq = await nextSequence('invoiceNumber')
    const prefix = process.env.INVOICE_PREFIX || 'INV'
    this.invoiceNumber = `${prefix}-${String(seq).padStart(5, '0')}`
  }

  recalculateInvoice(this)
})

export const Invoice =
  (models.Invoice as Model<IInvoice>) || model<IInvoice>('Invoice', InvoiceSchema)

export default Invoice
