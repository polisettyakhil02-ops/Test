import { and, asc, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '@/db'
import { documentLineTaxes, documentLines, documents, items, parties } from '@/db/schema'
import { PAGE_SIZE, paged, pageOffset, type Page } from '@/lib/paging'
import { isRecordId } from '@/lib/record-id'

export { PAGE_SIZE, pageOffset, type Page } from '@/lib/paging'

/**
 * Read-side queries shared by the pages.
 *
 * Note there is no `containsRegex` helper any more: parameterised `ILIKE` with
 * an escaped pattern replaces hand-built regexes, so a search for "(" is just a
 * literal bracket rather than something that can blow up a query.
 */

/** Escapes LIKE wildcards so user input is matched literally. */
function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

export async function listParties(
  entityId: string,
  query: string,
  options: { page?: number; pageSize?: number } = {},
): Promise<Page<typeof parties.$inferSelect>> {
  const page = Math.max(options.page ?? 1, 1)
  const pageSize = options.pageSize ?? PAGE_SIZE

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

  // Sequential rather than Promise.all on purpose: `npm run dev:db` serves a
  // single-connection PGlite, and issuing two queries at once against it is a
  // property of the harness that has no business shaping the query layer.
  const rows = await db
    .select()
    .from(parties)
    .where(where)
    .orderBy(asc(parties.name))
    .limit(pageSize)
    .offset(pageOffset(page, pageSize))

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
  query: string,
  options: { page?: number; pageSize?: number } = {},
): Promise<Page<typeof items.$inferSelect>> {
  const page = Math.max(options.page ?? 1, 1)
  const pageSize = options.pageSize ?? PAGE_SIZE

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
    .offset(pageOffset(page, pageSize))

  const [totals] = await db.select({ value: count() }).from(items).where(where)

  return paged(rows, Number(totals?.value ?? 0), page, pageSize)
}

/**
 * Whole-list reads for the form pickers, which need every option in one <select>
 * rather than a page of them. Still bounded: a picker with more entries than
 * this needs to become a search box, and silently truncating is better than
 * silently loading forever.
 */
export const PICKER_LIMIT = 500

export async function allItems(entityId: string) {
  return db
    .select()
    .from(items)
    .where(eq(items.entityId, entityId))
    .orderBy(asc(items.name))
    .limit(PICKER_LIMIT)
}

export async function allParties(entityId: string) {
  return db
    .select()
    .from(parties)
    .where(eq(parties.entityId, entityId))
    .orderBy(asc(parties.name))
    .limit(PICKER_LIMIT)
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
 * The allocated figure is a subquery rather than a column: settlement is
 * derived from the allocation rows, so it cannot drift out of step with them.
 */
export async function listDocuments(
  entityId: string,
  options: {
    docType?: 'invoice' | 'credit_note' | 'payment'
    status?: string
    query?: string
    page?: number
    pageSize?: number
  },
): Promise<Page<DocumentListRow>> {
  const page = Math.max(options.page ?? 1, 1)
  const pageSize = options.pageSize ?? PAGE_SIZE
  const conditions = [eq(documents.entityId, entityId)]

  if (options.docType) conditions.push(eq(documents.docType, options.docType))
  if (options.status) conditions.push(eq(documents.status, options.status as 'draft'))
  if (options.query) {
    const pattern = likePattern(options.query)
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
      partyName: sql<string>`${documents.partySnapshot} ->> 'name'`,
      issueDate: documents.issueDate,
      dueDate: documents.dueDate,
      totalMinor: documents.totalMinor,
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
    .offset(pageOffset(page, pageSize))

  const [totals] = await db
    .select({ value: count() })
    .from(documents)
    .where(and(...conditions))

  return paged(
    rows.map((row) => ({ ...row, allocatedMinor: Number(row.allocatedMinor) })),
    Number(totals?.value ?? 0),
    page,
    pageSize,
  )
}

/**
 * Everything a GST return needs for a period, in one read.
 *
 * The join back to `documents` resolves the invoice a credit note corrects:
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
    .where(
      inArray(
        documentLines.documentId,
        docs.map((doc) => doc.id),
      ),
    )
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

  // The tax components stored at posting time -- CGST/SGST or IGST. Reading
  // them back is what lets the document show the same breakdown it was issued
  // with, rather than recomputing from a rate that may since have changed.
  const taxes = lines.length
    ? await db
        .select()
        .from(documentLineTaxes)
        .where(
          inArray(
            documentLineTaxes.documentLineId,
            lines.map((line) => line.id),
          ),
        )
    : []

  const [allocated] = await db
    .select({
      total: sql<string>`COALESCE(SUM(amount_minor), 0)`,
    })
    .from(sql`allocations`)
    .where(sql`to_document_id = ${id}`)

  return { doc, lines, taxes, allocatedMinor: Number(allocated?.total ?? 0) }
}

/** Open invoices for a party, for the payment allocation screen. */
export async function openInvoicesFor(entityId: string, partyId: string) {
  if (!isRecordId(partyId)) return []

  const rows = await db.execute(sql`
    SELECT d.id,
           d.doc_number,
           d.issue_date,
           d.due_date,
           d.total_minor,
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
    issueDate: String(row.issue_date),
    dueDate: (row.due_date as string | null) ?? null,
    totalMinor: Number(row.total_minor),
    allocatedMinor: Number(row.allocated),
    openMinor: Number(row.total_minor) - Number(row.allocated),
  }))
}
