import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '@/db'
import { documentLines, documents, items, parties } from '@/db/schema'

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

export async function listParties(entityId: string, query: string) {
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

  return db.select().from(parties).where(where).orderBy(asc(parties.name))
}

export async function getParty(entityId: string, id: string) {
  const [row] = await db
    .select()
    .from(parties)
    .where(and(eq(parties.entityId, entityId), eq(parties.id, id)))
    .limit(1)
  return row ?? null
}

export async function listItems(entityId: string, query: string) {
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

  return db.select().from(items).where(where).orderBy(asc(items.name))
}

export async function getItem(entityId: string, id: string) {
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
  options: { docType?: 'invoice' | 'credit_note' | 'payment'; status?: string; query?: string; limit?: number },
): Promise<DocumentListRow[]> {
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
    .limit(options.limit ?? 200)

  return rows.map((row) => ({ ...row, allocatedMinor: Number(row.allocatedMinor) }))
}

export async function getDocument(entityId: string, id: string) {
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

  const [allocated] = await db
    .select({
      total: sql<string>`COALESCE(SUM(amount_minor), 0)`,
    })
    .from(sql`allocations`)
    .where(sql`to_document_id = ${id}`)

  return { doc, lines, allocatedMinor: Number(allocated?.total ?? 0) }
}

/** Open invoices for a party, for the payment allocation screen. */
export async function openInvoicesFor(entityId: string, partyId: string) {
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
