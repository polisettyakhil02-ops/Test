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

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
})

export function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount)
}
