import { Router } from 'express'
import { renderToBuffer } from '@react-pdf/renderer'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { documents, entities, journalEntries, journalLines, accounts, parties } from '@/db/schema'
import { badRequest, handler, notFound, param } from '@/lib/errors'
import { parseMinor } from '@/domain/money'
import { priceDocument, resolveSupplyKind, taxSummary } from '@/domain/pricing'
import {
  openBalanceMinor,
  postInvoice,
  postPayment,
  recordAudit,
  replaceDocumentLines,
  reverseDocument,
} from '@/domain/posting'
import { buildEinvoicePayload, einvoiceBlockers } from '@/domain/einvoice'
import { getDocument, listDocuments, openInvoicesFor } from '@/lib/queries'
import { einvoiceInputFor } from '@/lib/einvoice-input'
import { formatAddress } from '@/lib/dto'
import { qrDataUrl } from '@/lib/qr'
import { invoiceSchema, irnSchema, paymentSchema } from '@/lib/validation'
import { requireAuth, requireRole, sessionOf } from '@/middleware/auth'
import { InvoicePdf } from '@/pdf/invoice-pdf'

export const documentRoutes = Router()

const page = (value: unknown) => {
  const n = Number(value)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
}

const DOC_TYPES = ['invoice', 'credit_note', 'payment'] as const

documentRoutes.get(
  '/documents',
  requireAuth,
  handler(async (req, res) => {
    const session = sessionOf(req)
    const docType = DOC_TYPES.find((t) => t === req.query.docType)
    res.json(
      await listDocuments(session.entityId, {
        docType,
        query: typeof req.query.q === 'string' ? req.query.q : '',
        page: page(req.query.page),
      }),
    )
  }),
)

documentRoutes.get(
  '/documents/:id',
  requireAuth,
  handler(async (req, res) => {
    const session = sessionOf(req)
    const found = await getDocument(session.entityId, param(req, 'id'))
    if (!found) throw notFound('That document no longer exists.')

    const summary = taxSummary(
      found.lines.map((line) => ({
        lineSubtotalMinor: line.lineSubtotalMinor,
        lineDiscountMinor: line.lineDiscountMinor,
        lineTaxMinor: line.lineTaxMinor,
        lineTotalMinor: line.lineTotalMinor,
        taxes: found.taxes
          .filter((tax) => tax.documentLineId === line.id)
          .map((tax) => ({
            component: tax.component as 'CGST' | 'SGST' | 'IGST',
            ratePercent: tax.ratePercent,
            taxableMinor: tax.taxableMinor,
            amountMinor: tax.amountMinor,
          })),
      })),
    )

    // The ledger entry this document produced, so the books are visible from
    // the document rather than hidden behind a report.
    const entryLines =
      found.doc.status === 'posted' || found.doc.status === 'voided'
        ? await db
            .select({
              entryId: journalEntries.id,
              memo: journalEntries.memo,
              code: accounts.code,
              name: accounts.name,
              debitMinor: journalLines.debitMinor,
              creditMinor: journalLines.creditMinor,
            })
            .from(journalLines)
            .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
            .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
            .where(eq(journalEntries.sourceId, found.doc.id))
            .orderBy(journalEntries.postedAt, journalLines.lineNo)
        : []

    // Whether it can be registered, computed with the same code the payload
    // route runs -- so the UI cannot promise something the download refuses.
    let einvoice: { blockers: { field: string; message: string }[]; qrDataUrl: string | null } | null = null
    if (found.doc.status === 'posted' && found.doc.docType !== 'payment') {
      const input = await einvoiceInputFor(session.entityId, found.doc.id)
      einvoice = {
        blockers: input ? einvoiceBlockers(input.input) : [],
        qrDataUrl: found.doc.signedQrCode ? await qrDataUrl(found.doc.signedQrCode) : null,
      }
    }

    res.json({ ...found, taxSummary: summary, entryLines, einvoice })
  }),
)

/** Prices a draft and writes it, header and lines together. */
async function saveDraft(
  session: { entityId: string },
  input: ReturnType<typeof invoiceSchema.parse>,
  documentId?: string,
) {
  const [party] = await db
    .select()
    .from(parties)
    .where(and(eq(parties.entityId, session.entityId), eq(parties.id, input.partyId)))
    .limit(1)
  if (!party) throw badRequest('That client no longer exists.')

  const [org] = await db.select().from(entities).where(eq(entities.id, session.entityId)).limit(1)
  const supplyKind = resolveSupplyKind(org?.stateCode ?? '', party.stateCode)

  const priced = priceDocument({
    lines: input.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPriceMinor: parseMinor(line.unitPrice),
      taxRatePercent: line.taxRatePercent,
    })),
    discountType: input.discountType,
    discountValue: input.discountValue,
    supplyKind,
  })

  const header = {
    entityId: session.entityId,
    docType: input.docType,
    partyId: party.id,
    partySnapshot: {
      name: party.name,
      email: party.email,
      phone: party.phone,
      gstin: party.gstin,
      stateCode: party.stateCode,
      address: formatAddress(party.billingAddress),
    },
    issueDate: input.issueDate,
    dueDate: input.dueDate || null,
    subtotalMinor: priced.subtotalMinor,
    discountMinor: priced.discountMinor,
    taxMinor: priced.taxMinor,
    totalMinor: priced.totalMinor,
    discountType: input.discountType,
    discountValue: input.discountValue,
    supplyKind,
    placeOfSupply: party.stateCode,
    notes: input.notes,
    terms: input.terms,
    correctsDocumentId: input.correctsDocumentId,
    updatedAt: new Date(),
  }

  return db.transaction(async (tx) => {
    let id = documentId
    if (id) {
      await tx.update(documents).set(header).where(eq(documents.id, id))
    } else {
      const [created] = await tx.insert(documents).values(header).returning()
      id = created.id
    }

    await replaceDocumentLines(
      tx,
      id,
      input.lines.map((line, index) => ({
        lineNo: index + 1,
        itemId: line.itemId ?? null,
        description: line.description,
        hsnSac: line.hsnSac,
        unit: line.unit || 'unit',
        quantity: line.quantity,
        unitPriceMinor: parseMinor(line.unitPrice),
        taxRatePercent: line.taxRatePercent,
        ...priced.lines[index],
      })),
    )
    return id
  })
}

documentRoutes.post(
  '/documents',
  requireRole('accountant'),
  handler(async (req, res) => {
    const session = sessionOf(req)
    const id = await saveDraft(session, invoiceSchema.parse(req.body))
    res.status(201).json({ id })
  }),
)

documentRoutes.patch(
  '/documents/:id',
  requireRole('accountant'),
  handler(async (req, res) => {
    const session = sessionOf(req)
    const found = await getDocument(session.entityId, param(req, 'id'))
    if (!found) throw notFound('That document no longer exists.')
    if (found.doc.status !== 'draft') {
      throw badRequest('This document is posted and cannot be edited. Raise a credit note instead.')
    }

    const input = invoiceSchema.parse({
      ...req.body,
      docType: found.doc.docType,
      correctsDocumentId: found.doc.correctsDocumentId,
    })
    await saveDraft(session, input, found.doc.id)
    res.json({ id: found.doc.id })
  }),
)

documentRoutes.delete(
  '/documents/:id',
  requireRole('accountant'),
  handler(async (req, res) => {
    const session = sessionOf(req)
    // The database refuses this for anything not a draft, so there is no way to
    // delete a posted document even by mistake.
    await db
      .delete(documents)
      .where(and(eq(documents.entityId, session.entityId), eq(documents.id, param(req, 'id'))))
    res.json({ ok: true })
  }),
)

/** The one-way door: draft becomes posted, and the ledger entry is written. */
documentRoutes.post(
  '/documents/:id/post',
  requireRole('accountant'),
  handler(async (req, res) => {
    const session = sessionOf(req)
    const found = await getDocument(session.entityId, param(req, 'id'))
    if (!found) throw notFound('That document no longer exists.')

    const result = await db.transaction(async (tx) =>
      postInvoice(tx, found.doc.id, { id: session.userId, email: session.email }),
    )
    res.json({ number: result.number })
  }),
)

documentRoutes.post(
  '/documents/:id/void',
  requireRole('admin'),
  handler(async (req, res) => {
    const session = sessionOf(req)
    const found = await getDocument(session.entityId, param(req, 'id'))
    if (!found) throw notFound('That document no longer exists.')

    await db.transaction(async (tx) =>
      reverseDocument(tx, found.doc.id, { id: session.userId, email: session.email }),
    )
    res.json({ ok: true })
  }),
)

/**
 * Stamps a posted invoice with what the IRP returned. The database allows this
 * exact update and nothing else on a posted document: write-once, with no other
 * column riding along.
 */
documentRoutes.post(
  '/documents/:id/irn',
  requireRole('accountant'),
  handler(async (req, res) => {
    const session = sessionOf(req)
    const found = await getDocument(session.entityId, param(req, 'id'))
    if (!found) throw notFound('That document no longer exists.')
    if (found.doc.status !== 'posted') throw badRequest('Only a posted document can carry an IRN.')
    if (found.doc.irn) {
      throw badRequest('This invoice already has an IRN. An IRN cannot be replaced once issued.')
    }

    const input = irnSchema.parse(req.body)
    await db.transaction(async (tx) => {
      await tx
        .update(documents)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(documents.id, found.doc.id))

      await recordAudit(tx, {
        entityId: session.entityId,
        actorId: session.userId,
        actorEmail: session.email,
        action: 'einvoice.record',
        recordType: 'document',
        recordId: found.doc.id,
        after: { irn: input.irn, ackNo: input.ackNo, ackDate: input.ackDate },
      })
    })

    res.json({ ok: true })
  }),
)

/** The NIC 1.1 payload, or the reasons it cannot be built. */
documentRoutes.get(
  '/documents/:id/einvoice',
  requireRole('accountant'),
  handler(async (req, res) => {
    const session = sessionOf(req)
    const found = await einvoiceInputFor(session.entityId, param(req, 'id'))
    if (!found) throw notFound('That document no longer exists.')

    const blockers = einvoiceBlockers(found.input)
    if (blockers.length > 0) {
      res.status(422).json({ blockers })
      return
    }

    res
      .status(200)
      .type('application/json')
      .set('Content-Disposition', `attachment; filename="einvoice-${found.docNumber ?? param(req, 'id')}.json"`)
      .send(JSON.stringify(buildEinvoicePayload(found.input), null, 2))
  }),
)

documentRoutes.get(
  '/documents/:id/pdf',
  requireAuth,
  handler(async (req, res) => {
    const session = sessionOf(req)
    const found = await getDocument(session.entityId, param(req, 'id'))
    if (!found) throw notFound('That document no longer exists.')

    const [org] = await db.select().from(entities).where(eq(entities.id, session.entityId)).limit(1)
    const qr = found.doc.signedQrCode ? await qrDataUrl(found.doc.signedQrCode, 300) : null

    const buffer = await renderToBuffer(
      InvoicePdf({
        invoice: {
          docType: found.doc.docType,
          docNumber: found.doc.docNumber,
          status: found.doc.status,
          partySnapshot: found.doc.partySnapshot,
          issueDate: found.doc.issueDate,
          dueDate: found.doc.dueDate,
          subtotalMinor: found.doc.subtotalMinor,
          discountMinor: found.doc.discountMinor,
          totalMinor: found.doc.totalMinor,
          allocatedMinor: found.allocatedMinor,
          discountType: found.doc.discountType,
          discountValue: found.doc.discountValue,
          supplyKind: found.doc.supplyKind,
          notes: found.doc.notes,
          terms: found.doc.terms,
          irn: found.doc.irn,
          ackNo: found.doc.ackNo,
          ackDate: found.doc.ackDate,
          qrDataUrl: qr,
          lines: found.lines.map((line) => ({
            id: line.id,
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
          })),
        },
        company: {
          name: org?.name ?? 'Company',
          addressLines: org?.addressLines ?? [],
          gstin: org?.gstin ?? '',
          email: org?.email ?? '',
          phone: org?.phone ?? '',
          bankDetails: org?.bankDetails ?? '',
          footerNote: 'This is a computer-generated document.',
        },
      }),
    )

    res
      .status(200)
      .type('application/pdf')
      .set(
        'Content-Disposition',
        `${req.query.download ? 'attachment' : 'inline'}; filename="${found.doc.docNumber ?? 'draft'}.pdf"`,
      )
      .set('Cache-Control', 'no-store')
      .send(Buffer.from(buffer))
  }),
)

/* ---------------------------------------------------------------- payments */

documentRoutes.get(
  '/clients/:id/open-invoices',
  requireAuth,
  handler(async (req, res) => {
    const session = sessionOf(req)
    res.json({ rows: await openInvoicesFor(session.entityId, param(req, 'id')) })
  }),
)

documentRoutes.post(
  '/payments',
  requireRole('accountant'),
  handler(async (req, res) => {
    const session = sessionOf(req)
    const input = paymentSchema.parse(req.body)

    const amountMinor = parseMinor(input.amount)
    const targets = input.allocations
      .map((a) => ({ documentId: a.documentId, amountMinor: parseMinor(a.amount) }))
      .filter((a) => a.amountMinor > 0)

    const allocated = targets.reduce((sum, t) => sum + t.amountMinor, 0)
    if (allocated > amountMinor) {
      throw badRequest('You have allocated more than the payment amount.', {
        amount: 'Allocations exceed this payment',
      })
    }

    const [party] = await db
      .select()
      .from(parties)
      .where(and(eq(parties.entityId, session.entityId), eq(parties.id, input.partyId)))
      .limit(1)
    if (!party) throw badRequest('That client no longer exists.')

    // Each allocation is capped at what the invoice still owes, so a stale form
    // cannot over-settle a document someone else just paid.
    for (const target of targets) {
      const open = await openBalanceMinor(db, target.documentId)
      if (target.amountMinor > open) {
        throw badRequest('One of those invoices has already been settled. Reload and try again.')
      }
    }

    const number = await db.transaction(async (tx) => {
      const [payment] = await tx
        .insert(documents)
        .values({
          entityId: session.entityId,
          docType: 'payment',
          partyId: party.id,
          partySnapshot: {
            name: party.name,
            email: party.email,
            phone: party.phone,
            gstin: party.gstin,
            stateCode: party.stateCode,
            address: formatAddress(party.billingAddress),
          },
          issueDate: input.issueDate,
          totalMinor: amountMinor,
          subtotalMinor: amountMinor,
          notes: input.reference,
        })
        .returning()

      const result = await postPayment(tx, payment.id, targets, {
        id: session.userId,
        email: session.email,
      })
      return result.number
    })

    res.status(201).json({ number })
  }),
)
