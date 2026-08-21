import type { ClientSession, Collection, Db as MongoDatabase, MongoClient } from 'mongodb'

/**
 * The document shapes MongoDB stores, and the collection handles built on top of
 * them.
 *
 * This is the Mongo equivalent of the old drizzle `schema.ts` — the one place
 * every other module imports types from. Two structural changes from the
 * Postgres schema, both a direct consequence of MongoDB's document model rather
 * than a stylistic choice:
 *
 *   - A document's lines (and each line's tax components) are embedded arrays
 *     on the document itself, not separate collections joined by foreign key.
 *     They are never read, written or queried independently of their parent, so
 *     three normalized tables collapse into one document with nested arrays.
 *
 *   - A journal entry's lines are embedded the same way. This is not just
 *     convenient: it means "debits equal credits" can be a MongoDB document
 *     validator evaluated against the one document being written, which is
 *     what makes the balance check still a database-enforced invariant rather
 *     than something only application code checks. See db/indexes.ts.
 *
 * Every id is a v4 UUID string (crypto.randomUUID()), stored as Mongo's `_id`,
 * not an ObjectId. That is deliberate: the API, the zod validators and the
 * browser all already deal in UUID strings, and keeping that shape means none
 * of them have to change for the database underneath to change.
 */

export type Role = 'admin' | 'accountant' | 'viewer'
export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense'
export type PeriodState = 'open' | 'soft_closed' | 'closed'
export type DocType = 'invoice' | 'credit_note' | 'payment'
export type DocStatus = 'draft' | 'posted' | 'voided'
export type SupplyKind = 'intra_state' | 'inter_state' | 'exempt'
export type DiscountType = 'fixed' | 'percentage'

export interface EntityDoc {
  _id: string
  name: string
  legalName: string
  gstin: string
  stateCode: string
  addressLines: string[]
  email: string
  phone: string
  bankDetails: string
  functionalCurrency: string
  createdAt: Date
}

export interface UserDoc {
  _id: string
  email: string
  name: string
  passwordHash: string
  role: Role
  isActive: boolean
  createdAt: Date
}

export interface AccountDoc {
  _id: string
  entityId: string
  code: string
  name: string
  type: AccountType
  parentId: string | null
  /** Only leaf accounts may receive postings. Enforced in postJournalEntry. */
  isPostable: boolean
  isActive: boolean
}

export interface PeriodDoc {
  _id: string
  entityId: string
  name: string
  startsOn: string
  endsOn: string
  state: PeriodState
  closedAt: Date | null
  closedBy: string | null
}

export interface NumberSeriesDoc {
  _id: string
  entityId: string
  docType: DocType
  fiscalYear: string
  prefix: string
  padding: number
  nextValue: number
}

export interface Address {
  line1: string
  line2: string
  city: string
  state: string
  postalCode: string
  country: string
}

export const BLANK_ADDRESS: Address = {
  line1: '',
  line2: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'India',
}

export interface PartyDoc {
  _id: string
  entityId: string
  name: string
  isCustomer: boolean
  isVendor: boolean
  email: string
  phone: string
  gstin: string
  /** Place of supply drives whether GST splits CGST+SGST or becomes IGST. */
  stateCode: string
  billingAddress: Address
  notes: string
  isActive: boolean
  createdAt: Date
}

export interface ItemDoc {
  _id: string
  entityId: string
  name: string
  description: string
  hsnSac: string
  unit: string
  unitPriceMinor: number
  /** The rate copied onto a new invoice line; lines snapshot it. */
  defaultTaxRatePercent: string
  incomeAccountId: string | null
  isActive: boolean
  createdAt: Date
}

export interface DocumentLineTax {
  component: string // CGST | SGST | IGST
  ratePercent: string
  taxableMinor: number
  amountMinor: number
  accountId: string | null
}

export interface DocumentLine {
  /** Stable per-line id, so the browser can key and edit rows. */
  _id: string
  lineNo: number
  itemId: string | null
  description: string
  hsnSac: string
  unit: string
  quantity: string
  unitPriceMinor: number
  taxRatePercent: string
  incomeAccountId: string | null
  lineSubtotalMinor: number
  lineDiscountMinor: number
  lineTaxMinor: number
  lineTotalMinor: number
  taxes: DocumentLineTax[]
}

export interface PartySnapshot {
  name: string
  email: string
  phone: string
  gstin: string
  stateCode: string
  address: string
}

export interface DocumentDoc {
  _id: string
  entityId: string
  docType: DocType
  /** Null while draft: a number is only burned at posting time. */
  docNumber: string | null
  status: DocStatus
  partyId: string
  /** Snapshot of the party as at posting — renaming a customer must never
   *  rewrite a document already issued. */
  partySnapshot: PartySnapshot
  issueDate: string
  dueDate: string | null
  currency: string
  fxRate: string
  subtotalMinor: number
  discountMinor: number
  taxMinor: number
  totalMinor: number
  /** How much of `totalMinor` has been settled by payments or credit notes.
   *  A maintained running total, not derived at read time — see the comment
   *  on `allocateAmount` in domain/posting.ts for why. */
  allocatedMinor: number
  discountType: DiscountType
  discountValue: string
  supplyKind: SupplyKind
  placeOfSupply: string
  /** Credit notes point at the invoice they correct. */
  correctsDocumentId: string | null
  notes: string
  terms: string
  // e-invoicing (IRP). Recorded after the invoice is registered; the QR
  // string is what the printed invoice must carry.
  irn: string | null
  ackNo: string | null
  ackDate: string | null
  signedQrCode: string | null
  postedAt: Date | null
  postedBy: string | null
  voidedAt: Date | null
  lines: DocumentLine[]
  createdAt: Date
  updatedAt: Date
}

export interface JournalLine {
  lineNo: number
  accountId: string
  partyId: string | null
  debitMinor: number
  creditMinor: number
  memo: string
}

export interface JournalEntryDoc {
  _id: string
  entityId: string
  periodId: string
  entryDate: string
  sourceType: string
  sourceId: string | null
  memo: string
  reversalOfId: string | null
  postedAt: Date
  postedBy: string | null
  lines: JournalLine[]
}

export interface AllocationDoc {
  _id: string
  entityId: string
  /** The payment or credit note providing the funds. */
  fromDocumentId: string
  /** The invoice being settled. */
  toDocumentId: string
  amountMinor: number
  allocatedAt: Date
}

export interface AuditLogDoc {
  _id: string
  entityId: string | null
  actorId: string | null
  actorEmail: string
  action: string
  recordType: string
  recordId: string | null
  before: unknown
  after: unknown
  at: Date
}

export interface OutboxDoc {
  _id: string
  topic: string
  payload: unknown
  createdAt: Date
  deliveredAt: Date | null
  attempts: number
  /** When the drain worker may next pick this row up. Stored rather than
   *  computed at read time so a failing endpoint cannot be retried by two
   *  workers on different clocks. Doubles as a claim lease — see
   *  domain/webhooks.ts. */
  nextAttemptAt: Date
  lastError: string
}

/**
 * Every collection, plus the session bound to the current transaction, if any.
 *
 * This is the Mongo equivalent of drizzle's `db` / `tx` — the object every
 * domain function receives, and the one thing that changes between "outside a
 * transaction" and "inside one" is `session`. Every read or write passes
 * `{ session: store.session }` explicitly; there is no ambient/implicit
 * transaction the way a Postgres session variable would give you.
 */
export interface Store {
  client: MongoClient
  session: ClientSession | undefined
  entities: Collection<EntityDoc>
  users: Collection<UserDoc>
  accounts: Collection<AccountDoc>
  accountingPeriods: Collection<PeriodDoc>
  numberSeries: Collection<NumberSeriesDoc>
  parties: Collection<PartyDoc>
  items: Collection<ItemDoc>
  documents: Collection<DocumentDoc>
  journalEntries: Collection<JournalEntryDoc>
  allocations: Collection<AllocationDoc>
  auditLog: Collection<AuditLogDoc>
  outbox: Collection<OutboxDoc>
}

export function makeStore(db: MongoDatabase, client: MongoClient, session?: ClientSession): Store {
  return {
    client,
    session,
    entities: db.collection('entities'),
    users: db.collection('users'),
    accounts: db.collection('accounts'),
    accountingPeriods: db.collection('accounting_periods'),
    numberSeries: db.collection('number_series'),
    parties: db.collection('parties'),
    items: db.collection('items'),
    documents: db.collection('documents'),
    journalEntries: db.collection('journal_entries'),
    allocations: db.collection('allocations'),
    auditLog: db.collection('audit_log'),
    outbox: db.collection('outbox'),
  }
}

/** Binds a session to an existing store, for use inside a transaction. */
export function withSession(store: Store, session: ClientSession): Store {
  return { ...store, session }
}
