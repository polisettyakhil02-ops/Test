import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  integer,
  bigint,
  boolean,
  jsonb,
  index,
  uniqueIndex,
  check,
  pgEnum,
} from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'

/*
 * Money is stored as bigint MINOR UNITS (paise), never a float or numeric-as-
 * double. Every rounding decision then happens once, deliberately, in the tax
 * and allocation code -- not silently at each read.
 */

export const accountTypeEnum = pgEnum('account_type', [
  'asset',
  'liability',
  'equity',
  'income',
  'expense',
])

export const periodStateEnum = pgEnum('period_state', ['open', 'soft_closed', 'closed'])

export const docTypeEnum = pgEnum('doc_type', ['invoice', 'credit_note', 'payment'])

export const docStatusEnum = pgEnum('doc_status', [
  'draft',
  'posted',
  'voided',
])

export const roleEnum = pgEnum('user_role', ['admin', 'accountant', 'viewer'])

export const supplyKindEnum = pgEnum('supply_kind', ['intra_state', 'inter_state', 'exempt'])

// ---------------------------------------------------------------------------
// Organisation
// ---------------------------------------------------------------------------

export const entities = pgTable('entities', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  legalName: text('legal_name').notNull().default(''),
  gstin: text('gstin').notNull().default(''),
  stateCode: text('state_code').notNull().default(''),
  addressLines: jsonb('address_lines').$type<string[]>().notNull().default([]),
  email: text('email').notNull().default(''),
  phone: text('phone').notNull().default(''),
  bankDetails: text('bank_details').notNull().default(''),
  functionalCurrency: text('functional_currency').notNull().default('INR'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: roleEnum('role').notNull().default('admin'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_email_key').on(sql`lower(${t.email})`)],
)

// ---------------------------------------------------------------------------
// Chart of accounts
// ---------------------------------------------------------------------------

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityId: uuid('entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    type: accountTypeEnum('type').notNull(),
    parentId: uuid('parent_id'),
    // Only leaf accounts may receive postings. Enforced in postJournalEntry.
    isPostable: boolean('is_postable').notNull().default(true),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [uniqueIndex('accounts_entity_code_key').on(t.entityId, t.code)],
)

// ---------------------------------------------------------------------------
// Accounting periods -- posting outside an open period is refused
// ---------------------------------------------------------------------------

export const accountingPeriods = pgTable(
  'accounting_periods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityId: uuid('entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on').notNull(),
    state: periodStateEnum('state').notNull().default('open'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedBy: uuid('closed_by'),
  },
  (t) => [
    uniqueIndex('periods_entity_start_key').on(t.entityId, t.startsOn),
    check('periods_range_valid', sql`${t.endsOn} >= ${t.startsOn}`),
  ],
)

// ---------------------------------------------------------------------------
// Gapless numbering, allocated under a row lock inside the posting transaction
// ---------------------------------------------------------------------------

export const numberSeries = pgTable(
  'number_series',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityId: uuid('entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'restrict' }),
    docType: docTypeEnum('doc_type').notNull(),
    fiscalYear: text('fiscal_year').notNull(),
    prefix: text('prefix').notNull(),
    padding: integer('padding').notNull().default(5),
    nextValue: bigint('next_value', { mode: 'number' }).notNull().default(1),
  },
  (t) => [
    uniqueIndex('series_key').on(t.entityId, t.docType, t.fiscalYear),
    check('series_next_positive', sql`${t.nextValue} >= 1`),
  ],
)

// ---------------------------------------------------------------------------
// Parties (customers today, vendors later -- same record, different roles)
// ---------------------------------------------------------------------------

export const parties = pgTable(
  'parties',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityId: uuid('entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    isCustomer: boolean('is_customer').notNull().default(true),
    isVendor: boolean('is_vendor').notNull().default(false),
    email: text('email').notNull().default(''),
    phone: text('phone').notNull().default(''),
    gstin: text('gstin').notNull().default(''),
    // Place of supply drives whether GST splits CGST+SGST or becomes IGST.
    stateCode: text('state_code').notNull().default(''),
    billingAddress: jsonb('billing_address')
      .$type<{
        line1: string
        line2: string
        city: string
        state: string
        postalCode: string
        country: string
      }>()
      .notNull()
      .default({ line1: '', line2: '', city: '', state: '', postalCode: '', country: 'India' }),
    notes: text('notes').notNull().default(''),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('parties_entity_name_idx').on(t.entityId, t.name)],
)

// ---------------------------------------------------------------------------
// Tax codes and dated rates. Rates are rows, not constants: an invoice from
// last year must still price at last year's rate.
// ---------------------------------------------------------------------------

export const taxCodes = pgTable(
  'tax_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityId: uuid('entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [uniqueIndex('tax_codes_entity_code_key').on(t.entityId, t.code)],
)

export const taxRates = pgTable(
  'tax_rates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taxCodeId: uuid('tax_code_id')
      .notNull()
      .references(() => taxCodes.id, { onDelete: 'cascade' }),
    // Total rate; the engine splits it into components by supply kind.
    ratePercent: text('rate_percent').notNull(),
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to'),
  },
  (t) => [index('tax_rates_code_from_idx').on(t.taxCodeId, t.effectiveFrom)],
)

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export const items = pgTable(
  'items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityId: uuid('entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    hsnSac: text('hsn_sac').notNull().default(''),
    unit: text('unit').notNull().default('unit'),
    unitPriceMinor: bigint('unit_price_minor', { mode: 'number' }).notNull().default(0),
    // The rate copied onto a new invoice line. Lines snapshot it, so changing
    // it here never alters a document already raised.
    defaultTaxRatePercent: text('default_tax_rate_percent').notNull().default('0'),
    taxCodeId: uuid('tax_code_id').references(() => taxCodes.id, { onDelete: 'set null' }),
    incomeAccountId: uuid('income_account_id').references(() => accounts.id, {
      onDelete: 'set null',
    }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('items_entity_name_idx').on(t.entityId, t.name),
    check('items_price_non_negative', sql`${t.unitPriceMinor} >= 0`),
  ],
)

// ---------------------------------------------------------------------------
// Documents. One table for invoices, credit notes and payments -- they share a
// lifecycle, a number series and a posting contract.
// ---------------------------------------------------------------------------

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityId: uuid('entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'restrict' }),
    docType: docTypeEnum('doc_type').notNull(),
    // NULL while draft: a number is only burned at posting time.
    docNumber: text('doc_number'),
    status: docStatusEnum('status').notNull().default('draft'),
    partyId: uuid('party_id')
      .notNull()
      .references(() => parties.id, { onDelete: 'restrict' }),
    // Snapshot of the party as at posting -- renaming a customer must never
    // rewrite a document already issued.
    partySnapshot: jsonb('party_snapshot')
      .$type<{
        name: string
        email: string
        phone: string
        gstin: string
        stateCode: string
        address: string
      }>()
      .notNull(),
    issueDate: date('issue_date').notNull(),
    dueDate: date('due_date'),
    currency: text('currency').notNull().default('INR'),
    fxRate: text('fx_rate').notNull().default('1'),

    subtotalMinor: bigint('subtotal_minor', { mode: 'number' }).notNull().default(0),
    discountMinor: bigint('discount_minor', { mode: 'number' }).notNull().default(0),
    taxMinor: bigint('tax_minor', { mode: 'number' }).notNull().default(0),
    totalMinor: bigint('total_minor', { mode: 'number' }).notNull().default(0),

    discountType: text('discount_type').notNull().default('fixed'),
    discountValue: text('discount_value').notNull().default('0'),

    supplyKind: supplyKindEnum('supply_kind').notNull().default('intra_state'),
    placeOfSupply: text('place_of_supply').notNull().default(''),

    // Credit notes point at the invoice they correct.
    correctsDocumentId: uuid('corrects_document_id'),

    notes: text('notes').notNull().default(''),
    terms: text('terms').notNull().default(''),

    postedAt: timestamp('posted_at', { withTimezone: true }),
    postedBy: uuid('posted_by').references(() => users.id, { onDelete: 'set null' }),
    voidedAt: timestamp('voided_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('documents_entity_number_key')
      .on(t.entityId, t.docType, t.docNumber)
      .where(sql`${t.docNumber} is not null`),
    index('documents_party_idx').on(t.partyId, t.issueDate),
    index('documents_status_idx').on(t.entityId, t.docType, t.status),
    // A posted document must carry a number and a posting stamp; a draft must
    // carry neither. This is the immutability contract, enforced by the DB.
    check(
      'documents_posted_has_number',
      sql`(${t.status} <> 'posted') OR (${t.docNumber} IS NOT NULL AND ${t.postedAt} IS NOT NULL)`,
    ),
    check('documents_totals_non_negative', sql`${t.totalMinor} >= 0`),
  ],
)

export const documentLines = pgTable(
  'document_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    lineNo: integer('line_no').notNull(),
    itemId: uuid('item_id').references(() => items.id, { onDelete: 'set null' }),
    // Snapshot fields.
    description: text('description').notNull(),
    hsnSac: text('hsn_sac').notNull().default(''),
    unit: text('unit').notNull().default('unit'),
    quantity: text('quantity').notNull().default('1'),
    unitPriceMinor: bigint('unit_price_minor', { mode: 'number' }).notNull().default(0),
    taxRatePercent: text('tax_rate_percent').notNull().default('0'),
    incomeAccountId: uuid('income_account_id').references(() => accounts.id, {
      onDelete: 'set null',
    }),

    lineSubtotalMinor: bigint('line_subtotal_minor', { mode: 'number' }).notNull().default(0),
    lineDiscountMinor: bigint('line_discount_minor', { mode: 'number' }).notNull().default(0),
    lineTaxMinor: bigint('line_tax_minor', { mode: 'number' }).notNull().default(0),
    lineTotalMinor: bigint('line_total_minor', { mode: 'number' }).notNull().default(0),
  },
  (t) => [
    uniqueIndex('document_lines_doc_no_key').on(t.documentId, t.lineNo),
    check('document_lines_amounts_non_negative', sql`${t.lineSubtotalMinor} >= 0`),
  ],
)

/** Per-line tax components: CGST + SGST, or IGST. */
export const documentLineTaxes = pgTable('document_line_taxes', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentLineId: uuid('document_line_id')
    .notNull()
    .references(() => documentLines.id, { onDelete: 'cascade' }),
  component: text('component').notNull(), // CGST | SGST | IGST
  ratePercent: text('rate_percent').notNull(),
  taxableMinor: bigint('taxable_minor', { mode: 'number' }).notNull(),
  amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
  accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
})

// ---------------------------------------------------------------------------
// The ledger. Append-only. Nothing here is ever updated or deleted.
// ---------------------------------------------------------------------------

export const journalEntries = pgTable(
  'journal_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityId: uuid('entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'restrict' }),
    periodId: uuid('period_id')
      .notNull()
      .references(() => accountingPeriods.id, { onDelete: 'restrict' }),
    entryDate: date('entry_date').notNull(),
    sourceType: text('source_type').notNull(),
    sourceId: uuid('source_id'),
    memo: text('memo').notNull().default(''),
    reversalOfId: uuid('reversal_of_id'),
    postedAt: timestamp('posted_at', { withTimezone: true }).notNull().defaultNow(),
    postedBy: uuid('posted_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [
    index('journal_entries_source_idx').on(t.sourceType, t.sourceId),
    index('journal_entries_period_idx').on(t.periodId),
  ],
)

export const journalLines = pgTable(
  'journal_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => journalEntries.id, { onDelete: 'cascade' }),
    lineNo: integer('line_no').notNull(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    partyId: uuid('party_id').references(() => parties.id, { onDelete: 'restrict' }),
    debitMinor: bigint('debit_minor', { mode: 'number' }).notNull().default(0),
    creditMinor: bigint('credit_minor', { mode: 'number' }).notNull().default(0),
    memo: text('memo').notNull().default(''),
  },
  (t) => [
    index('journal_lines_account_idx').on(t.accountId),
    index('journal_lines_entry_idx').on(t.entryId),
    index('journal_lines_party_idx').on(t.partyId),
    // A line is a debit or a credit, never both, never negative.
    check('journal_lines_one_sided', sql`${t.debitMinor} = 0 OR ${t.creditMinor} = 0`),
    check(
      'journal_lines_non_negative',
      sql`${t.debitMinor} >= 0 AND ${t.creditMinor} >= 0`,
    ),
    check(
      'journal_lines_not_empty',
      sql`${t.debitMinor} > 0 OR ${t.creditMinor} > 0`,
    ),
  ],
)

// ---------------------------------------------------------------------------
// Receivables: payments allocate across invoices. A customer's balance is the
// sum of their AR journal lines -- never a column on the invoice.
// ---------------------------------------------------------------------------

export const allocations = pgTable(
  'allocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityId: uuid('entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'restrict' }),
    // The payment or credit note providing the funds.
    fromDocumentId: uuid('from_document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'restrict' }),
    // The invoice being settled.
    toDocumentId: uuid('to_document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'restrict' }),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    allocatedAt: timestamp('allocated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('allocations_to_idx').on(t.toDocumentId),
    index('allocations_from_idx').on(t.fromDocumentId),
    check('allocations_positive', sql`${t.amountMinor} > 0`),
  ],
)

// ---------------------------------------------------------------------------
// Audit trail. Written in the same transaction as the change it describes, so
// a rolled-back action leaves no audit lie.
// ---------------------------------------------------------------------------

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityId: uuid('entity_id'),
    actorId: uuid('actor_id'),
    actorEmail: text('actor_email').notNull().default(''),
    action: text('action').notNull(),
    recordType: text('record_type').notNull(),
    recordId: uuid('record_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_record_idx').on(t.recordType, t.recordId), index('audit_at_idx').on(t.at)],
)

// ---------------------------------------------------------------------------
// Transactional outbox: written inside the posting transaction, delivered
// after commit.
// ---------------------------------------------------------------------------

export const outbox = pgTable(
  'outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    topic: text('topic').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
  },
  (t) => [index('outbox_undelivered_idx').on(t.deliveredAt)],
)

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const documentsRelations = relations(documents, ({ many, one }) => ({
  lines: many(documentLines),
  party: one(parties, { fields: [documents.partyId], references: [parties.id] }),
}))

export const documentLinesRelations = relations(documentLines, ({ one, many }) => ({
  document: one(documents, {
    fields: [documentLines.documentId],
    references: [documents.id],
  }),
  taxes: many(documentLineTaxes),
}))

export const documentLineTaxesRelations = relations(documentLineTaxes, ({ one }) => ({
  line: one(documentLines, {
    fields: [documentLineTaxes.documentLineId],
    references: [documentLines.id],
  }),
}))

export const journalEntriesRelations = relations(journalEntries, ({ many }) => ({
  lines: many(journalLines),
}))

export const journalLinesRelations = relations(journalLines, ({ one }) => ({
  entry: one(journalEntries, {
    fields: [journalLines.entryId],
    references: [journalEntries.id],
  }),
  account: one(accounts, { fields: [journalLines.accountId], references: [accounts.id] }),
}))
