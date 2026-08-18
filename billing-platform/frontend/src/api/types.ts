/** The shapes the API returns. Kept in one file so a change is easy to trace. */

export type Role = 'admin' | 'accountant' | 'viewer'
export type DocType = 'invoice' | 'credit_note' | 'payment'
export type DocStatus = 'draft' | 'posted' | 'voided'

export interface User {
  id: string
  email: string
  name: string
  role: Role
}

export interface Entity {
  id: string
  name: string
  legalName: string
  gstin: string
  stateCode: string
  addressLines: string[]
  email: string
  phone: string
  bankDetails: string
}

export interface Address {
  line1?: string
  line2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
}

export interface Party {
  id: string
  name: string
  email: string
  phone: string
  gstin: string
  stateCode: string
  billingAddress: Address
  notes: string
}

export interface Item {
  id: string
  name: string
  description: string
  hsnSac: string
  unit: string
  unitPriceMinor: number
  defaultTaxRatePercent: string
}

export interface Page<T> {
  rows: T[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

export interface DocumentRow {
  id: string
  docType: DocType
  docNumber: string | null
  status: DocStatus
  partyId: string
  partyName: string
  issueDate: string
  dueDate: string | null
  totalMinor: number
  allocatedMinor: number
  irn: string | null
}

export interface DocumentLine {
  id: string
  lineNo: number
  itemId: string | null
  description: string
  hsnSac: string
  unit: string
  quantity: string
  unitPriceMinor: number
  taxRatePercent: string
  lineSubtotalMinor: number
  lineDiscountMinor: number
  lineTaxMinor: number
  lineTotalMinor: number
}

export interface TaxRow {
  component: string
  ratePercent: string
  taxableMinor: number
  amountMinor: number
}

export interface DocumentDetail {
  doc: {
    id: string
    docType: DocType
    docNumber: string | null
    status: DocStatus
    partyId: string
    partySnapshot: { name: string; email: string; phone: string; gstin: string; stateCode: string; address: string }
    issueDate: string
    dueDate: string | null
    subtotalMinor: number
    discountMinor: number
    taxMinor: number
    totalMinor: number
    discountType: 'fixed' | 'percentage'
    discountValue: string
    supplyKind: string
    placeOfSupply: string
    notes: string
    terms: string
    correctsDocumentId: string | null
    irn: string | null
    ackNo: string | null
    ackDate: string | null
  }
  lines: DocumentLine[]
  taxes: Array<TaxRow & { documentLineId: string }>
  allocatedMinor: number
  taxSummary: TaxRow[]
  entryLines: Array<{
    entryId: string
    memo: string
    code: string
    name: string
    debitMinor: number
    creditMinor: number
  }>
  einvoice: { blockers: Array<{ field: string; message: string }>; qrDataUrl: string | null } | null
}

export interface AgeingRow {
  documentId: string
  docNumber: string | null
  partyId: string
  partyName: string
  issueDate: string
  dueDate: string | null
  totalMinor: number
  allocatedMinor: number
  openMinor: number
  daysOverdue: number
  bucket: 'current' | '1-30' | '31-60' | '61-90' | '90+'
}

export interface DashboardResponse {
  asOf: string
  totals: {
    revenueMinor: number
    receivableMinor: number
    taxPayableMinor: number
    openInvoiceCount: number
    overdueCount: number
    overdueMinor: number
    draftCount: number
  }
  ageing: AgeingRow[]
}

export interface TrialBalance {
  rows: Array<{
    accountId: string
    code: string
    name: string
    type: string
    debitMinor: number
    creditMinor: number
    balanceMinor: number
  }>
  totalDebitMinor: number
  totalCreditMinor: number
}

export interface Gstr1 {
  from: string
  to: string
  b2b: Array<{ gstin: string; receiver: string; invoiceNumber: string; invoiceDate: string; invoiceValueMinor: number; placeOfSupply: string; ratePercent: string; taxableMinor: number }>
  b2cl: Array<{ invoiceNumber: string; invoiceDate: string; invoiceValueMinor: number; placeOfSupply: string; ratePercent: string; taxableMinor: number }>
  b2cs: Array<{ type: string; placeOfSupply: string; ratePercent: string; taxableMinor: number }>
  cdnr: Array<{ gstin: string; receiver: string; noteNumber: string; noteDate: string; originalInvoiceNumber: string; originalInvoiceDate: string; placeOfSupply: string; noteValueMinor: number; ratePercent: string; taxableMinor: number }>
  hsn: Array<{ hsnSac: string; description: string; unit: string; quantity: number; taxableMinor: number; taxMinor: number }>
  totals: { taxableMinor: number; taxMinor: number; documentCount: number }
}

export interface Statement {
  openingMinor: number
  closingMinor: number
  chargedMinor: number
  settledMinor: number
  rows: Array<{
    entryId: string
    date: string
    sourceType: string
    documentId: string | null
    docNumber: string | null
    memo: string
    debitMinor: number
    creditMinor: number
    balanceMinor: number
  }>
}

export interface OutboxResponse {
  summary: { pending: number; delivered: number; deadLettered: number; oldestPendingAt: string | null }
  configured: boolean
  maxAttempts: number
  rows: Array<{
    id: string
    topic: string
    payload: { number?: string; documentId?: string; totalMinor?: number }
    createdAt: string
    deliveredAt: string | null
    attempts: number
    nextAttemptAt: string
    lastError: string
  }>
}

export interface DrainResult {
  attempted: number
  delivered: number
  failed: number
  failures: Array<{ id: string; error: string }>
}

export interface OpenInvoice {
  id: string
  docNumber: string | null
  issueDate: string
  dueDate: string | null
  totalMinor: number
  allocatedMinor: number
  openMinor: number
}
