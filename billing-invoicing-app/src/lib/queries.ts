import { getDb } from '@/db'
import type { DocumentDoc, DocumentLine, DocType, PartyDoc, ItemDoc } from '@/db/collections'
import { PAGE_SIZE, paged, pageOffset, type Page } from '@/lib/paging'
import { isRecordId } from '@/lib/record-id'

export { PAGE_SIZE, pageOffset, type Page } from '@/lib/paging'

/**
 * Read-side queries shared by the pages.
 *
 * Escapes a substring for use inside a case-insensitive Mongo regex — the
 * direct replacement for parameterised `ILIKE` with an escaped `%`/`_`
 * pattern: a search for "(" stays a literal bracket rather than something
 * that can blow up a query, just via regex-metacharacter escaping instead of
 * SQL LIKE-wildcard escaping.
 */
function searchPattern(query: string): RegExp {
  return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
}

/** Renames Mongo's `_id` to the `id` every page already expects. */
function withId<T extends { _id: string }>(doc: T): Omit<T, '_id'> & { id: string } {
  const { _id, ...rest } = doc
  return { id: _id, ...rest }
}

export async function listParties(
  entityId: string,
  query: string,
  options: { page?: number; pageSize?: number } = {},
): Promise<Page<Omit<PartyDoc, '_id'> & { id: string }>> {
  const store = await getDb()
  const page = Math.max(options.page ?? 1, 1)
  const pageSize = options.pageSize ?? PAGE_SIZE

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

  const rows = await store.parties
    .find(filter)
    .sort({ name: 1 })
    .skip(pageOffset(page, pageSize))
    .limit(pageSize)
    .toArray()
  const total = await store.parties.countDocuments(filter)

  return paged(rows.map(withId), total, page, pageSize)
}

export async function getParty(entityId: string, id: string) {
  if (!isRecordId(id)) return null
  const store = await getDb()
  const row = await store.parties.findOne({ _id: id, entityId })
  return row ? withId(row) : null
}

export async function listItems(
  entityId: string,
  query: string,
  options: { page?: number; pageSize?: number } = {},
): Promise<Page<Omit<ItemDoc, '_id'> & { id: string }>> {
  const store = await getDb()
  const page = Math.max(options.page ?? 1, 1)
  const pageSize = options.pageSize ?? PAGE_SIZE

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

  const rows = await store.items
    .find(filter)
    .sort({ name: 1 })
    .skip(pageOffset(page, pageSize))
    .limit(pageSize)
    .toArray()
  const total = await store.items.countDocuments(filter)

  return paged(rows.map(withId), total, page, pageSize)
}

/**
 * Whole-list reads for the form pickers, which need every option in one <select>
 * rather than a page of them. Still bounded: a picker with more entries than
 * this needs to become a search box, and silently truncating is better than
 * silently loading forever.
 */
export const PICKER_LIMIT = 500

export async function allItems(entityId: string) {
  const store = await getDb()
  const rows = await store.items.find({ entityId }).sort({ name: 1 }).limit(PICKER_LIMIT).toArray()
  return rows.map(withId)
}

export async function allParties(entityId: string) {
  const store = await getDb()
  const rows = await store.parties.find({ entityId }).sort({ name: 1 }).limit(PICKER_LIMIT).toArray()
  return rows.map(withId)
}

export async function getItem(entityId: string, id: string) {
  if (!isRecordId(id)) return null
  const store = await getDb()
  const row = await store.items.findOne({ _id: id, entityId })
  return row ? withId(row) : null
}

export interface DocumentListRow {
  id: string
  docType: string
  docNumber: string | null
  status: string
  partyName: string
  issueDate: string
  dueDate: string | null
  totalMinor: number
  allocatedMinor: number
}

/**
 * Documents with how much has been settled against each.
 *
 * `allocatedMinor` is read straight off the document rather than summed from
 * `allocations` at query time — it is a maintained running total precisely so
 * it can never drift out of step with them. See `allocateAmount` in
 * `domain/posting.ts`.
 */
export async function listDocuments(
  entityId: string,
  options: {
    docType?: DocType
    status?: string
    query?: string
    page?: number
    pageSize?: number
  },
): Promise<Page<DocumentListRow>> {
  const store = await getDb()
  const page = Math.max(options.page ?? 1, 1)
  const pageSize = options.pageSize ?? PAGE_SIZE

  const filter: Record<string, unknown> = { entityId }
  if (options.docType) filter.docType = options.docType
  if (options.status) filter.status = options.status
  if (options.query) {
    const pattern = searchPattern(options.query)
    filter.$or = [{ docNumber: pattern }, { 'partySnapshot.name': pattern }]
  }

  const rows = await store.documents
    .find(filter)
    .sort({ issueDate: -1, createdAt: -1 })
    .skip(pageOffset(page, pageSize))
    .limit(pageSize)
    .project<{
      _id: string
      docType: DocType
      docNumber: string | null
      status: string
      partySnapshot: { name: string }
      issueDate: string
      dueDate: string | null
      totalMinor: number
      allocatedMinor: number
    }>({
      docType: 1,
      docNumber: 1,
      status: 1,
      partySnapshot: 1,
      issueDate: 1,
      dueDate: 1,
      totalMinor: 1,
      allocatedMinor: 1,
    })
    .toArray()
  const total = await store.documents.countDocuments(filter)

  return paged(
    rows.map((row) => ({
      id: row._id,
      docType: row.docType,
      docNumber: row.docNumber,
      status: row.status,
      partyName: row.partySnapshot?.name ?? '',
      issueDate: row.issueDate,
      dueDate: row.dueDate,
      totalMinor: row.totalMinor,
      allocatedMinor: row.allocatedMinor,
    })),
    total,
    page,
    pageSize,
  )
}

/**
 * Everything a GST return needs for a period, in one read.
 *
 * The lookup back to `documents` resolves the invoice a credit note corrects:
 * CDNR reports the original invoice's number and date, not the note's.
 */
export interface ReturnDocumentRow {
  docType: 'invoice' | 'credit_note' | 'payment'
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
  lines: Array<{
    description: string
    hsnSac: string
    unit: string
    quantity: string
    taxRatePercent: string
    lineSubtotalMinor: number
    lineDiscountMinor: number
    lineTaxMinor: number
  }>
}

export async function listReturnDocuments(
  entityId: string,
  period: { from: string; to: string },
): Promise<ReturnDocumentRow[]> {
  const store = await getDb()

  const docs = await store.documents
    .aggregate<DocumentDoc & { corrects: DocumentDoc[] }>([
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
    ])
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

/** A document line, flattened for the page — the shape every template has always seen. */
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

export async function getDocument(entityId: string, id: string) {
  if (!isRecordId(id)) return null
  const store = await getDb()

  const doc = await store.documents.findOne({ _id: id, entityId })
  if (!doc) return null

  const { lines, taxes } = flattenLines(doc.lines)
  const header = withId(doc)
  // `lines` stays on the Mongo document (that is where the tax breakdown
  // lives) but every page has always read it as its own array, flattened
  // above, so it does not belong on `doc` twice.
  const { lines: _embedded, ...docHeader } = header
  void _embedded

  return { doc: docHeader, lines, taxes, allocatedMinor: doc.allocatedMinor }
}

/** Open invoices for a party, for the payment allocation screen. */
export async function openInvoicesFor(entityId: string, partyId: string) {
  if (!isRecordId(partyId)) return []
  const store = await getDb()

  const rows = await store.documents
    .find({
      entityId,
      partyId,
      docType: 'invoice',
      status: 'posted',
      $expr: { $gt: ['$totalMinor', '$allocatedMinor'] },
    })
    .sort({ issueDate: 1 })
    .project<{
      _id: string
      docNumber: string | null
      issueDate: string
      dueDate: string | null
      totalMinor: number
      allocatedMinor: number
    }>({ docNumber: 1, issueDate: 1, dueDate: 1, totalMinor: 1, allocatedMinor: 1 })
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
