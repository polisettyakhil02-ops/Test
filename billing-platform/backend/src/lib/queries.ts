import { and, asc, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '@/db'
import { documentLineTaxes, documentLines, documents, items, parties } from '@/db/schema'

/**
 * Read-side queries. Parameterised ILIKE with an escaped pattern, so a search
 * for "(" is a literal bracket rather than something that can blow up a query.
 */

export const PAGE_SIZE = 50

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Ids arrive from the URL, so they are user input. "Not a uuid" and "no such
 * record" are the same answer to the caller, but only one of them is what
 * happens if the string reaches PostgreSQL -- which raises `invalid input
 * syntax for type uuid` and turns an honest 404 into a 500.
 */
export function isRecordId(id: string): boolean {
  return UUID.test(id)
}

function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
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

export async function listParties(
  entityId: string,
  options: { query?: string; page?: number; pageSize?: number } = {},
) {
  const page = Math.max(options.page ?? 1, 1)
  const pageSize = options.pageSize ?? PAGE_SIZE
  const query = options.query?.trim()

  const where = query
    ? and(
        eq(parties.entityId, entityId),
        or(
          ilike(parties.name, likePattern(query)),
          ilike(parties.email, likePattern(query)),
          ilike(parties.gstin, likePattern(query)),
        ),
      )
    : eq(parties.entityId, entityId)

  const rows = await db
    .select()
    .from(parties)
    .where(where)
    .orderBy(asc(parties.name))
    .limit(pageSize)
    .offset(offsetOf(page, pageSize))

  const [totals] = await db.select({ value: count() }).from(parties).where(where)
  return paged(rows, Number(totals?.value ?? 0), page, pageSize)
}

export async function getParty(entityId: string, id: string) {
  if (!isRecordId(id)) return null
  const [row] = await db
    .select()
    .from(parties)
    .where(and(eq(parties.entityId, entityId), eq(parties.id, id)))
    .limit(1)
  return row ?? null
}

export async function listItems(
  entityId: string,
  options: { query?: string; page?: number; pageSize?: number } = {},
) {
  const page = Math.max(options.page ?? 1, 1)
  const pageSize = options.pageSize ?? PAGE_SIZE
  const query = options.query?.trim()

  const where = query
    ? and(
        eq(items.entityId, entityId),
        or(
          ilike(items.name, likePattern(query)),
          ilike(items.hsnSac, likePattern(query)),
          ilike(items.description, likePattern(query)),
        ),
      )
    : eq(items.entityId, entityId)

  const rows = await db
    .select()
    .from(items)
    .where(where)
    .orderBy(asc(items.name))
    .limit(pageSize)
    .offset(offsetOf(page, pageSize))

  const [totals] = await db.select({ value: count() }).from(items).where(where)
  return paged(rows, Number(totals?.value ?? 0), page, pageSize)
}

export async function getItem(entityId: string, id: string) {
  if (!isRecordId(id)) return null
  const [row] = await db
    .select()
    .from(items)
    .where(and(eq(items.entityId, entityId), eq(items.id, id)))
    .limit(1)
  return row ?? null
}

/** Every item or client, for the form pickers. Bounded, deliberately. */
export const PICKER_LIMIT = 500

export const allItems = (entityId: string) =>
  db.select().from(items).where(eq(items.entityId, entityId)).orderBy(asc(items.name)).limit(PICKER_LIMIT)

export const allParties = (entityId: string) =>
  db.select().from(parties).where(eq(parties.entityId, entityId)).orderBy(asc(parties.name)).limit(PICKER_LIMIT)

export async function listDocuments(
  entityId: string,
  options: {
    docType?: 'invoice' | 'credit_note' | 'payment'
    status?: string
    query?: string
    page?: number
    pageSize?: number
  } = {},
) {
  const page = Math.max(options.page ?? 1, 1)
  const pageSize = options.pageSize ?? PAGE_SIZE
  const conditions = [eq(documents.entityId, entityId)]

  if (options.docType) conditions.push(eq(documents.docType, options.docType))
  if (options.status) conditions.push(eq(documents.status, options.status as 'draft'))
  if (options.query?.trim()) {
    const pattern = likePattern(options.query.trim())
    conditions.push(
      or(
        ilike(sql`COALESCE(${documents.docNumber}, '')`, pattern),
        ilike(sql`${documents.partySnapshot} ->> 'name'`, pattern),
      )!,
    )
  }

  const rows = await db
    .select({
      id: documents.id,
      docType: documents.docType,
      docNumber: documents.docNumber,
      status: documents.status,
      partyId: documents.partyId,
      partyName: sql<string>`${documents.partySnapshot} ->> 'name'`,
      issueDate: documents.issueDate,
      dueDate: documents.dueDate,
      totalMinor: documents.totalMinor,
      irn: documents.irn,
      allocatedMinor: sql<string>`(
        SELECT COALESCE(SUM(a.amount_minor), 0)
          FROM allocations a
         WHERE a.to_document_id = ${documents.id}
      )`,
    })
    .from(documents)
    .where(and(...conditions))
    .orderBy(desc(documents.issueDate), desc(documents.createdAt))
    .limit(pageSize)
    .offset(offsetOf(page, pageSize))

  const [totals] = await db.select({ value: count() }).from(documents).where(and(...conditions))

  return paged(
    rows.map((row) => ({ ...row, allocatedMinor: Number(row.allocatedMinor) })),
    Number(totals?.value ?? 0),
    page,
    pageSize,
  )
}

export async function getDocument(entityId: string, id: string) {
  if (!isRecordId(id)) return null

  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.entityId, entityId), eq(documents.id, id)))
    .limit(1)
  if (!doc) return null

  const lines = await db
    .select()
    .from(documentLines)
    .where(eq(documentLines.documentId, id))
    .orderBy(asc(documentLines.lineNo))

  // The tax components stored at posting time. Reading them back is what lets
  // the document show the breakdown it was issued with, rather than recomputing
  // from a rate that may since have changed.
  const taxes = lines.length
    ? await db
        .select()
        .from(documentLineTaxes)
        .where(inArray(documentLineTaxes.documentLineId, lines.map((line) => line.id)))
    : []

  const [allocated] = await db
    .select({ total: sql<string>`COALESCE(SUM(amount_minor), 0)` })
    .from(sql`allocations`)
    .where(sql`to_document_id = ${id}`)

  return { doc, lines, taxes, allocatedMinor: Number(allocated?.total ?? 0) }
}

/** Open invoices for a party, for the payment allocation screen. */
export async function openInvoicesFor(entityId: string, partyId: string) {
  if (!isRecordId(partyId)) return []

  const rows = await db.execute(sql`
    SELECT d.id, d.doc_number, d.issue_date, d.due_date, d.total_minor,
           COALESCE(a.allocated, 0) AS allocated
      FROM documents d
      LEFT JOIN (
            SELECT to_document_id, SUM(amount_minor) AS allocated
              FROM allocations GROUP BY to_document_id
           ) a ON a.to_document_id = d.id
     WHERE d.entity_id = ${entityId}
       AND d.party_id = ${partyId}
       AND d.doc_type = 'invoice'
       AND d.status = 'posted'
       AND d.total_minor > COALESCE(a.allocated, 0)
     ORDER BY d.issue_date
  `)

  return (rows as unknown as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    docNumber: (row.doc_number as string | null) ?? null,
    issueDate: String(row.issue_date).slice(0, 10),
    dueDate: row.due_date ? String(row.due_date).slice(0, 10) : null,
    totalMinor: Number(row.total_minor),
    allocatedMinor: Number(row.allocated),
    openMinor: Number(row.total_minor) - Number(row.allocated),
  }))
}

/** Everything a GST return needs for a period, in one read. */
export async function listReturnDocuments(entityId: string, period: { from: string; to: string }) {
  const corrected = alias(documents, 'corrected')

  const docs = await db
    .select({
      id: documents.id,
      docType: documents.docType,
      docNumber: documents.docNumber,
      issueDate: documents.issueDate,
      status: documents.status,
      partySnapshot: documents.partySnapshot,
      placeOfSupply: documents.placeOfSupply,
      supplyKind: documents.supplyKind,
      totalMinor: documents.totalMinor,
      correctsDocNumber: corrected.docNumber,
      correctsDocDate: corrected.issueDate,
    })
    .from(documents)
    .leftJoin(corrected, eq(documents.correctsDocumentId, corrected.id))
    .where(
      and(
        eq(documents.entityId, entityId),
        eq(documents.status, 'posted'),
        sql`${documents.docType} <> 'payment'`,
        sql`${documents.issueDate} >= ${period.from}`,
        sql`${documents.issueDate} <= ${period.to}`,
      ),
    )
    .orderBy(asc(documents.issueDate), asc(documents.docNumber))

  if (docs.length === 0) return []

  const lines = await db
    .select()
    .from(documentLines)
    .where(inArray(documentLines.documentId, docs.map((doc) => doc.id)))
    .orderBy(asc(documentLines.lineNo))

  const byDocument = new Map<string, typeof lines>()
  for (const line of lines) {
    const bucket = byDocument.get(line.documentId) ?? []
    bucket.push(line)
    byDocument.set(line.documentId, bucket)
  }

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
    correctsDocNumber: doc.correctsDocNumber,
    correctsDocDate: doc.correctsDocDate,
    lines: (byDocument.get(doc.id) ?? []).map((line) => ({
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
