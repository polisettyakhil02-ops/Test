import type { IClient } from '@/models/Client'
import type { IItem } from '@/models/Item'

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
