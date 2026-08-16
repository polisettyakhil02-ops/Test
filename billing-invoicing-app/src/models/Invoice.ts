import { Schema, model, models, Types, type Model, type HydratedDocument } from 'mongoose'
import { nextSequence } from '@/models/Counter'
import {
  INVOICE_STATUSES,
  recalculateInvoice,
  type DiscountType,
  type InvoiceStatus,
} from '@/lib/invoice-math'

// The arithmetic lives in lib/invoice-math.ts so the browser can run the exact
// same code for the live totals preview without importing Mongoose.
export {
  INVOICE_STATUSES,
  recalculateInvoice,
  round2,
  derivePaymentStatus,
  taxBreakdown,
} from '@/lib/invoice-math'
export type {
  InvoiceStatus,
  DiscountType,
  InvoiceTotals,
  CalcInput,
  CalcLine,
} from '@/lib/invoice-math'

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
