import type { IClient } from '@/models/Client'
import type { IItem } from '@/models/Item'
import type { IInvoice, IInvoiceLineItem } from '@/models/Invoice'
import type { InvoiceStatus, DiscountType } from '@/lib/invoice-math'

/**
 * Mongoose `.lean()` results still contain ObjectId and Date instances, which
 * cannot cross the server/client boundary. These map documents into plain
 * JSON-safe shapes for rendering and for passing into Client Components.
 */

export interface ClientDTO {
  id: string
  name: string
  email: string
  phone: string
  gstin: string
  notes: string
  billingAddress: {
    line1: string
    line2: string
    city: string
    state: string
    postalCode: string
    country: string
  }
  createdAt: string
}

export interface ItemDTO {
  id: string
  name: string
  description: string
  hsnSac: string
  unit: string
  price: number
  taxRate: number
  createdAt: string
}

type LeanDoc<T> = T & { _id: { toString(): string } }

export function toClientDTO(doc: LeanDoc<IClient>): ClientDTO {
  return {
    id: doc._id.toString(),
    name: doc.name,
    email: doc.email ?? '',
    phone: doc.phone ?? '',
    gstin: doc.gstin ?? '',
    notes: doc.notes ?? '',
    billingAddress: {
      line1: doc.billingAddress?.line1 ?? '',
      line2: doc.billingAddress?.line2 ?? '',
      city: doc.billingAddress?.city ?? '',
      state: doc.billingAddress?.state ?? '',
      postalCode: doc.billingAddress?.postalCode ?? '',
      country: doc.billingAddress?.country ?? '',
    },
    createdAt: doc.createdAt?.toISOString() ?? '',
  }
}

export function toItemDTO(doc: LeanDoc<IItem>): ItemDTO {
  return {
    id: doc._id.toString(),
    name: doc.name,
    description: doc.description ?? '',
    hsnSac: doc.hsnSac ?? '',
    unit: doc.unit ?? 'unit',
    price: doc.price ?? 0,
    taxRate: doc.taxRate ?? 0,
    createdAt: doc.createdAt?.toISOString() ?? '',
  }
}

export interface InvoiceLineDTO {
  id: string
  itemId: string | null
  description: string
  hsnSac: string
  unit: string
  quantity: number
  unitPrice: number
  taxRate: number
  lineSubtotal: number
  lineDiscount: number
  lineTaxAmount: number
  lineTotal: number
}

export interface InvoiceDTO {
  id: string
  invoiceNumber: string
  clientId: string
  clientSnapshot: {
    name: string
    email: string
    phone: string
    gstin: string
    address: string
  }
  issueDate: string
  dueDate: string
  status: InvoiceStatus
  lineItems: InvoiceLineDTO[]
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
  createdAt: string
}

// Omit before re-declaring: an intersection would merge the two `client` and
// `lineItems` types rather than replace them, which loses the `_id` fields.
type LeanInvoice = Omit<IInvoice, 'client' | 'lineItems'> & {
  _id: { toString(): string }
  client: unknown
  lineItems: Array<IInvoiceLineItem & { _id?: { toString(): string } }>
}

/** `<input type="date">` needs "YYYY-MM-DD"; everything is stored as UTC. */
export function toDateInputValue(date: Date | string | null | undefined): string {
  if (!date) return ''
  const parsed = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString().slice(0, 10)
}

/** `client` is an ObjectId when lean, or a populated document when populated. */
function clientIdOf(client: unknown): string {
  if (!client) return ''
  if (typeof client === 'object' && '_id' in (client as Record<string, unknown>)) {
    return String((client as { _id: unknown })._id)
  }
  return String(client)
}

export function toInvoiceDTO(doc: LeanInvoice): InvoiceDTO {
  return {
    id: doc._id.toString(),
    invoiceNumber: doc.invoiceNumber,
    clientId: clientIdOf(doc.client),
    clientSnapshot: {
      name: doc.clientSnapshot?.name ?? '',
      email: doc.clientSnapshot?.email ?? '',
      phone: doc.clientSnapshot?.phone ?? '',
      gstin: doc.clientSnapshot?.gstin ?? '',
      address: doc.clientSnapshot?.address ?? '',
    },
    issueDate: toDateInputValue(doc.issueDate),
    dueDate: toDateInputValue(doc.dueDate),
    status: doc.status,
    lineItems: (doc.lineItems ?? []).map((line, index) => ({
      id: line._id?.toString() ?? String(index),
      itemId: line.item ? line.item.toString() : null,
      description: line.description,
      hsnSac: line.hsnSac ?? '',
      unit: line.unit ?? 'unit',
      quantity: line.quantity ?? 0,
      unitPrice: line.unitPrice ?? 0,
      taxRate: line.taxRate ?? 0,
      lineSubtotal: line.lineSubtotal ?? 0,
      lineDiscount: line.lineDiscount ?? 0,
      lineTaxAmount: line.lineTaxAmount ?? 0,
      lineTotal: line.lineTotal ?? 0,
    })),
    discountType: doc.discountType ?? 'fixed',
    discountValue: doc.discountValue ?? 0,
    subtotal: doc.subtotal ?? 0,
    discountAmount: doc.discountAmount ?? 0,
    taxAmount: doc.taxAmount ?? 0,
    total: doc.total ?? 0,
    amountPaid: doc.amountPaid ?? 0,
    amountDue: doc.amountDue ?? 0,
    notes: doc.notes ?? '',
    terms: doc.terms ?? '',
    createdAt: doc.createdAt?.toISOString() ?? '',
  }
}

/** Single-line address for tables and, later, the invoice PDF. */
export function formatAddress(address: ClientDTO['billingAddress']): string {
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

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  paid: 'Paid',
  partially_paid: 'Partly paid',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
}

export const INVOICE_STATUS_VARIANTS: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'
> = {
  draft: 'secondary',
  sent: 'outline',
  paid: 'success',
  partially_paid: 'warning',
  overdue: 'destructive',
  cancelled: 'secondary',
}

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

/** Formats an ISO string for display; returns an em dash when absent. */
export function formatDate(iso: string): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date)
}

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
})

export function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount)
}

const plainNumberFormatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * Currency for the PDF, written as "INR 1,234.00".
 *
 * The rupee sign (U+20B9) is deliberately avoided here: PDF base-14 fonts use
 * WinAnsi encoding, which has no such glyph, so "₹" silently renders as "¹".
 * Verified by extracting text from a generated PDF. The web UI keeps the real
 * symbol -- browsers have fonts that cover it.
 */
export function formatCurrencyPlain(amount: number): string {
  return `INR ${plainNumberFormatter.format(amount)}`
}
