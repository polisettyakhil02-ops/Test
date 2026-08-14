// Hand-written to match supabase/schema.sql. Keep the two in sync when you
// change the schema (or regenerate with `supabase gen types typescript`).

export type InvoiceStatus =
  | 'draft'
  | 'sent'
  | 'paid'
  | 'partially_paid'
  | 'overdue'
  | 'cancelled'

export type DiscountType = 'percentage' | 'fixed'

export interface Client {
  id: string
  name: string
  address: string | null
  gstin: string | null
  email: string | null
  phone: string | null
  created_at: string
  updated_at: string
}

export interface Item {
  id: string
  name: string
  hsn_sac_code: string | null
  unit: string
  price: number
  tax_rate: number
  description: string | null
  created_at: string
  updated_at: string
}

export interface Invoice {
  id: string
  invoice_number: string
  client_id: string
  invoice_date: string
  due_date: string | null
  status: InvoiceStatus
  subtotal: number
  discount_type: DiscountType
  discount_value: number
  discount_amount: number
  tax_amount: number
  total: number
  amount_paid: number
  notes: string | null
  terms: string | null
  created_at: string
  updated_at: string
}

export interface InvoiceLineItem {
  id: string
  invoice_id: string
  item_id: string | null
  description: string
  hsn_sac_code: string | null
  quantity: number
  unit_price: number
  tax_rate: number
  line_subtotal: number
  line_tax_amount: number
  line_total: number
  sort_order: number
  created_at: string
}

type Insertable<T, Optional extends keyof T> = Omit<T, Optional> &
  Partial<Pick<T, Optional>>

type Timestamps = 'id' | 'created_at' | 'updated_at'

export interface Database {
  public: {
    Tables: {
      clients: {
        Row: Client
        Insert: Insertable<Client, Timestamps | 'address' | 'gstin' | 'email' | 'phone'>
        Update: Partial<Client>
        Relationships: []
      }
      items: {
        Row: Item
        Insert: Insertable<
          Item,
          Timestamps | 'hsn_sac_code' | 'unit' | 'price' | 'tax_rate' | 'description'
        >
        Update: Partial<Item>
        Relationships: []
      }
      invoices: {
        Row: Invoice
        Insert: Insertable<Invoice, Timestamps | 'invoice_number' | 'invoice_date' | 'due_date' | 'status' | 'subtotal' | 'discount_type' | 'discount_value' | 'discount_amount' | 'tax_amount' | 'total' | 'amount_paid' | 'notes' | 'terms'>
        Update: Partial<Invoice>
        Relationships: []
      }
      invoice_line_items: {
        Row: InvoiceLineItem
        Insert: Insertable<
          InvoiceLineItem,
          | 'id'
          | 'created_at'
          | 'item_id'
          | 'hsn_sac_code'
          | 'quantity'
          | 'unit_price'
          | 'tax_rate'
          | 'line_subtotal'
          | 'line_tax_amount'
          | 'line_total'
          | 'sort_order'
        >
        Update: Partial<InvoiceLineItem>
        Relationships: []
      }
    }
    Views: Record<never, never>
    Functions: Record<never, never>
    Enums: Record<never, never>
    CompositeTypes: Record<never, never>
  }
}
