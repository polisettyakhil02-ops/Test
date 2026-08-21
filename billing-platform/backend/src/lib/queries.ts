import { newId } from '@/db/ids'
import type { DocumentDoc, DocumentLine, DocumentLineTax, DocType, Store } from '@/db/collections'
import { withId } from '@/lib/serialize'

/**
 * Read and write access to parties, items and documents — the surface every
 * route in masters.ts and documents.ts goes through, so nothing outside this
 * file builds a Mongo filter or touches `_id` directly.
 */

export const PAGE_SIZE = 50

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Ids arrive from the URL, so they are user input. "Not a uuid" and "no such
 * record" are the same answer to the caller, but only one of them is what
 * happens if the string reaches MongoDB as a query value for a field with no
 * matching document — which is a clean empty result, not an error. This still
 * matters here: without it, a malformed id would search for a document that by
 * construction cannot exist, which is wasted work with the same answer this
 * check gives for free, one comparison earlier.
 */
export function isRecordId(id: string): boolean {
  return UUID.test(id)
}

/** Escapes a substring for use inside a case-insensitive Mongo regex. */
function searchPattern(query: string): RegExp {
  return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
}

export interface Page<T> {
  rows: T[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

function paged<T>(rows: T[], total: number, page: number, pageSize: number): Page<T> {
  return {
    rows,
    total,
    page: Math.max(page, 1),
    pageSize,
    // Always at least one page, so an empty list reads as "0 of 0" rather than
    // a control with no pages in it.
    pageCount: Math.max(Math.ceil(total / pageSize), 1),
  }
}

const offsetOf = (page: number, pageSize: number) => (Math.max(page, 1) - 1) * pageSize

/* ----------------------------------------------------------------- parties */

export async function listParties(
  store: Store,
  entityId: string,
  options: { query?: string; page?: number; pageSize?: number } = {},
) {
  const page = Math.max(options.page ?? 1, 1)
  const pageSize = options.pageSize ?? PAGE_SIZE
  const query = options.query?.trim()

  const filter = query
    ? {
        entityId,
        $or: [
          { name: searchPattern(query) },
          { email: searchPattern(query) },
          { gstin: searchPattern(query) },
        ],
      }
    : { entityId }

  const [rows, total] = await Promise.all([
    store.parties
      .find(filter, { session: store.session })
      .sort({ name: 1 })
      .skip(offsetOf(page, pageSize))
      .limit(pageSize)
      .toArray(),
    store.parties.countDocuments(filter, { session: store.session }),
  ])

  return paged(rows.map(withId), total, page, pageSize)
}

export async function getParty(store: Store, entityId: string, id: string) {
  if (!isRecordId(id)) return null
  const row = await store.parties.findOne({ _id: id, entityId }, { session: store.session })
  return row ? withId(row) : null
}

export interface PartyWrite {
  name: string
  email: string
  phone: string
  gstin: string
  stateCode: string
  notes: string
  billingAddress: { line1: string; line2: string; city: string; state: string; postalCode: string; country: string }
}

export async function insertParty(store: Store, entityId: string, input: PartyWrite) {
  const row = {
    _id: newId(),
    entityId,
    name: input.name,
    isCustomer: true,
    isVendor: false,
    email: input.email,
    phone: input.phone,
    gstin: input.gstin,
    stateCode: input.stateCode,
    billingAddress: input.billingAddress,
    notes: input.notes,
    isActive: true,
    createdAt: new Date(),
  }
  await store.parties.insertOne(row, { session: store.session })
  return withId(row)
}

export async function updateParty(store: Store, entityId: string, id: string, input: PartyWrite) {
  const result = await store.parties.findOneAndUpdate(
    { _id: id, entityId },
    { $set: input },
    { session: store.session, returnDocument: 'after' },
  )
  return result ? withId(result) : null
}

export async function deleteParty(store: Store, entityId: string, id: string) {
  // A client with documents is refused by an application-level check in the
  // route, which turns it into the same 409 a foreign key would have. MongoDB
  // has no foreign keys to refuse this on its own.
  await store.parties.deleteOne({ _id: id, entityId }, { session: store.session })
}

/** Every client, for the form pickers. Bounded, deliberately. */
export const PICKER_LIMIT = 500

export const allParties = async (store: Store, entityId: string) =>
  (
    await store.parties
      .find({ entityId }, { session: store.session })
      .sort({ name: 1 })
      .limit(PICKER_LIMIT)
      .toArray()
  ).map(withId)

/* ------------------------------------------------------------------- items */

export async function listItems(
  store: Store,
  entityId: string,
  options: { query?: string; page?: number; pageSize?: number } = {},
) {
  const page = Math.max(options.page ?? 1, 1)
  const pageSize = options.pageSize ?? PAGE_SIZE
  const query = options.query?.trim()

  const filter = query
    ? {
        entityId,
        $or: [
          { name: searchPattern(query) },
          { hsnSac: searchPattern(query) },
          { description: searchPattern(query) },
        ],
      }
    : { entityId }

  const [rows, total] = await Promise.all([
    store.items
      .find(filter, { session: store.session })
      .sort({ name: 1 })
      .skip(offsetOf(page, pageSize))
      .limit(pageSize)
      .toArray(),
    store.items.countDocuments(filter, { session: store.session }),
  ])

  return paged(rows.map(withId), total, page, pageSize)
}

export async function getItem(store: Store, entityId: string, id: string) {
  if (!isRecordId(id)) return null
  const row = await store.items.findOne({ _id: id, entityId }, { session: store.session })
  return row ? withId(row) : null
}

export interface ItemWrite {
  name: string
  description: string
  hsnSac: string
  unit: string
  unitPriceMinor: number
  defaultTaxRatePercent: string
}

export async function insertItem(store: Store, entityId: string, input: ItemWrite) {
  const row = {
    _id: newId(),
    entityId,
    name: input.name,
    description: input.description,
    hsnSac: input.hsnSac,
    unit: input.unit,
    unitPriceMinor: input.unitPriceMinor,
    defaultTaxRatePercent: input.defaultTaxRatePercent,
    incomeAccountId: null,
    isActive: true,
    createdAt: new Date(),
  }
  await store.items.insertOne(row, { session: store.session })
  return withId(row)
}

export async function updateItem(store: Store, entityId: string, id: string, input: ItemWrite) {
  const result = await store.items.findOneAndUpdate(
    { _id: id, entityId },
    { $set: input },
    { session: store.session, returnDocument: 'after' },
  )
  return result ? withId(result) : null
}

export async function deleteItem(store: Store, entityId: string, id: string) {
  await store.items.deleteOne({ _id: id, entityId }, { session: store.session })
}

export const PICKER_LIMIT_ITEMS = PICKER_LIMIT

export const allItems = async (store: Store, entityId: string) =>
  (
    await store.items
      .find({ entityId }, { session: store.session })
      .sort({ name: 1 })
      .limit(PICKER_LIMIT)
      .toArray()
  ).map(withId)

/* --------------------------------------------------------------- documents */

export interface DocumentRow {
  id: string
  docType: DocType
  docNumber: string | null
  status: string
  partyId: string
  partyName: string
  issueDate: string
  dueDate: string | null
  totalMinor: number
  irn: string | null
  allocatedMinor: number
}

export async function listDocuments(
  store: Store,
  entityId: string,
  options: {
    docType?: DocType
    status?: string
    query?: string
    page?: number
    pageSize?: number
  } = {},
): Promise<Page<DocumentRow>> {
  const page = Math.max(options.page ?? 1, 1)
  const pageSize = options.pageSize ?? PAGE_SIZE

  const filter: Record<string, unknown> = { entityId }
  if (options.docType) filter.docType = options.docType
  if (options.status) filter.status = options.status
  if (options.query?.trim()) {
    const pattern = searchPattern(options.query.trim())
    filter.$or = [{ docNumber: pattern }, { 'partySnapshot.name': pattern }]
  }

  const [facet] = await store.documents
    .aggregate<{
      rows: Array<{
        _id: string
        docType: DocType
        docNumber: string | null
        status: string
        partyId: string
        partySnapshot: { name: string }
        issueDate: string
        dueDate: string | null
        totalMinor: number
        irn: string | null
        allocatedMinor: number
      }>
      total: Array<{ count: number }>
    }>(
      [
        { $match: filter },
        { $sort: { issueDate: -1, createdAt: -1 } },
        {
          $facet: {
            rows: [
              { $skip: offsetOf(page, pageSize) },
              { $limit: pageSize },
              {
                $project: {
                  docType: 1,
                  docNumber: 1,
                  status: 1,
                  partyId: 1,
                  partySnapshot: 1,
                  issueDate: 1,
                  dueDate: 1,
                  totalMinor: 1,
                  irn: 1,
                  allocatedMinor: 1,
                },
              },
            ],
            total: [{ $count: 'count' }],
          },
        },
      ],
      { session: store.session },
    )
    .toArray()

  const rows: DocumentRow[] = (facet?.rows ?? []).map((row) => ({
    id: row._id,
    docType: row.docType,
    docNumber: row.docNumber,
    status: row.status,
    partyId: row.partyId,
    partyName: row.partySnapshot?.name ?? '',
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    totalMinor: row.totalMinor,
    irn: row.irn,
    allocatedMinor: row.allocatedMinor,
  }))

  return paged(rows, facet?.total[0]?.count ?? 0, page, pageSize)
}

/** A document line, flattened for the API — the shape the frontend has always seen. */
export interface DocumentLineFlat {
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

export interface TaxRowFlat {
  documentLineId: string
  component: string
  ratePercent: string
  taxableMinor: number
  amountMinor: number
}

function flattenLines(lines: DocumentLine[]): { lines: DocumentLineFlat[]; taxes: TaxRowFlat[] } {
  const flat: DocumentLineFlat[] = []
  const taxes: TaxRowFlat[] = []

  for (const line of lines) {
    flat.push({
      id: line._id,
      lineNo: line.lineNo,
      itemId: line.itemId,
      description: line.description,
      hsnSac: line.hsnSac,
      unit: line.unit,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      taxRatePercent: line.taxRatePercent,
      lineSubtotalMinor: line.lineSubtotalMinor,
      lineDiscountMinor: line.lineDiscountMinor,
      lineTaxMinor: line.lineTaxMinor,
      lineTotalMinor: line.lineTotalMinor,
    })
    for (const tax of line.taxes) {
      taxes.push({ documentLineId: line._id, ...tax })
    }
  }

  return { lines: flat, taxes }
}

export async function getDocument(store: Store, entityId: string, id: string) {
  if (!isRecordId(id)) return null

  const doc = await store.documents.findOne({ _id: id, entityId }, { session: store.session })
  if (!doc) return null

  const { lines, taxes } = flattenLines(doc.lines)
  const header = withId(doc)
  // `lines` stays on the Mongo document (that's where the tax breakdown lives)
  // but the API has always returned it as its own top-level array, flattened
  // above, so it does not belong on `doc` twice.
  const { lines: _embedded, ...docHeader } = header
  void _embedded

  return { doc: docHeader, lines, taxes, allocatedMinor: doc.allocatedMinor }
}

/** Open invoices for a party, for the payment allocation screen. */
export async function openInvoicesFor(store: Store, entityId: string, partyId: string) {
  if (!isRecordId(partyId)) return []

  const rows = await store.documents
    .find(
      {
        entityId,
        partyId,
        docType: 'invoice',
        status: 'posted',
        $expr: { $gt: ['$totalMinor', '$allocatedMinor'] },
      },
      {
        session: store.session,
        projection: { docNumber: 1, issueDate: 1, dueDate: 1, totalMinor: 1, allocatedMinor: 1 },
        sort: { issueDate: 1 },
      },
    )
    .toArray()

  return rows.map((row) => ({
    id: row._id,
    docNumber: row.docNumber,
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    totalMinor: row.totalMinor,
    allocatedMinor: row.allocatedMinor,
    openMinor: row.totalMinor - row.allocatedMinor,
  }))
}

export interface ReturnLine {
  description: string
  hsnSac: string
  unit: string
  quantity: string
  taxRatePercent: string
  lineSubtotalMinor: number
  lineDiscountMinor: number
  lineTaxMinor: number
}

export interface ReturnDocumentRow {
  docType: 'invoice' | 'credit_note'
  docNumber: string
  issueDate: string
  status: string
  buyerGstin: string
  buyerName: string
  placeOfSupply: string
  supplyKind: string
  totalMinor: number
  correctsDocNumber: string | null
  correctsDocDate: string | null
  lines: ReturnLine[]
}

/** Everything a GST return needs for a period, in one read. */
export async function listReturnDocuments(
  store: Store,
  entityId: string,
  period: { from: string; to: string },
): Promise<ReturnDocumentRow[]> {
  const docs = await store.documents
    .aggregate<DocumentDoc & { corrects: DocumentDoc[] }>(
      [
        {
          $match: {
            entityId,
            status: 'posted',
            docType: { $ne: 'payment' },
            issueDate: { $gte: period.from, $lte: period.to },
          },
        },
        { $sort: { issueDate: 1, docNumber: 1 } },
        { $lookup: { from: 'documents', localField: 'correctsDocumentId', foreignField: '_id', as: 'corrects' } },
      ],
      { session: store.session },
    )
    .toArray()

  return docs.map((doc) => ({
    docType: doc.docType as 'invoice' | 'credit_note',
    docNumber: doc.docNumber ?? '',
    issueDate: doc.issueDate,
    status: doc.status,
    buyerGstin: doc.partySnapshot.gstin ?? '',
    buyerName: doc.partySnapshot.name ?? '',
    placeOfSupply: doc.placeOfSupply || (doc.partySnapshot.stateCode ?? ''),
    supplyKind: doc.supplyKind,
    totalMinor: doc.totalMinor,
    correctsDocNumber: doc.corrects[0]?.docNumber ?? null,
    correctsDocDate: doc.corrects[0]?.issueDate ?? null,
    lines: doc.lines.map((line) => ({
      description: line.description,
      hsnSac: line.hsnSac,
      unit: line.unit,
      quantity: line.quantity,
      taxRatePercent: line.taxRatePercent,
      lineSubtotalMinor: line.lineSubtotalMinor,
      lineDiscountMinor: line.lineDiscountMinor,
      lineTaxMinor: line.lineTaxMinor,
    })),
  }))
}

export type { DocumentLine, DocumentLineTax }
