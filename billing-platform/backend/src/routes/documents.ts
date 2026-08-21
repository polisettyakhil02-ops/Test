import { Router } from 'express'
import { renderToBuffer } from '@react-pdf/renderer'
import { getDb, withTransaction } from '@/db'
import { newId } from '@/db/ids'
import type { DocumentDoc, DocumentLine, PartySnapshot } from '@/db/collections'
import { badRequest, handler, notFound, param } from '@/lib/errors'
import { parseMinor } from '@/domain/money'
import { priceDocument, resolveSupplyKind, taxSummary } from '@/domain/pricing'
import {
  buildDocumentLines,
  openBalanceMinor,
  postInvoice,
  postPayment,
  recordAudit,
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
    const store = await getDb()
    const docType = DOC_TYPES.find((t) => t === req.query.docType)
    res.json(
      await listDocuments(store, session.entityId, {
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
    const store = await getDb()
    const found = await getDocument(store, session.entityId, param(req, 'id'))
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
    const entryLines: Array<{
      entryId: string
      memo: string
      code: string
      name: string
      debitMinor: number
      creditMinor: number
    }> = []

    if (found.doc.status === 'posted' || found.doc.status === 'voided') {
      const entry = await store.journalEntries.findOne(
        { sourceId: found.doc.id },
        { sort: { postedAt: 1 } },
      )
      if (entry) {
        const accountIds = [...new Set(entry.lines.map((l) => l.accountId))]
        const accounts = await store.accounts.find({ _id: { $in: accountIds } }).toArray()
        const byId = new Map(accounts.map((a) => [a._id, a]))
        for (const line of entry.lines) {
          const account = byId.get(line.accountId)
          entryLines.push({
            entryId: entry._id,
            memo: entry.memo,
            code: account?.code ?? '',
            name: account?.name ?? '',
            debitMinor: line.debitMinor,
            creditMinor: line.creditMinor,
          })
        }
      }
    }

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

/** Prices a draft into a full document — header and lines together, one write. */
async function priceDraft(
  session: { entityId: string },
  input: ReturnType<typeof invoiceSchema.parse>,
): Promise<Omit<DocumentDoc, '_id' | 'createdAt' | 'updatedAt'>> {
  const store = await getDb()
  const party = await store.parties.findOne({ _id: input.partyId, entityId: session.entityId })
  if (!party) throw badRequest('That client no longer exists.')

  const org = await store.entities.findOne({ _id: session.entityId })
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

  const partySnapshot: PartySnapshot = {
    name: party.name,
    email: party.email,
    phone: party.phone,
    gstin: party.gstin,
    stateCode: party.stateCode,
    address: formatAddress(party.billingAddress),
  }

  const lines: DocumentLine[] = buildDocumentLines(
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

  return {
    entityId: session.entityId,
    docType: input.docType,
    docNumber: null,
    status: 'draft',
    partyId: party._id,
    partySnapshot,
    issueDate: input.issueDate,
    dueDate: input.dueDate || null,
    currency: 'INR',
    fxRate: '1',
    subtotalMinor: priced.subtotalMinor,
    discountMinor: priced.discountMinor,
    taxMinor: priced.taxMinor,
    totalMinor: priced.totalMinor,
    allocatedMinor: 0,
    discountType: input.discountType,
    discountValue: input.discountValue,
    supplyKind,
    placeOfSupply: party.stateCode,
    correctsDocumentId: input.correctsDocumentId,
    notes: input.notes,
    terms: input.terms,
    irn: null,
    ackNo: null,
    ackDate: null,
    signedQrCode: null,
    postedAt: null,
    postedBy: null,
    voidedAt: null,
    lines,
  }
}

documentRoutes.post(
  '/documents',
  requireRole('accountant'),
  handler(async (req, res) => {
    const session = sessionOf(req)
    const built = await priceDraft(session, invoiceSchema.parse(req.body))
    const store = await getDb()
    const now = new Date()
    const id = newId()
    await store.documents.insertOne({ _id: id, ...built, createdAt: now, updatedAt: now })
    res.status(201).json({ id })
  }),
)

documentRoutes.patch(
  '/documents/:id',
  requireRole('accountant'),
  handler(async (req, res) => {
    const session = sessionOf(req)
    const store = await getDb()
    const found = await getDocument(store, session.entityId, param(req, 'id'))
    if (!found) throw notFound('That document no longer exists.')
    if (found.doc.status !== 'draft') {
      throw badRequest('This document is posted and cannot be edited. Raise a credit note instead.')
    }

    const input = invoiceSchema.parse({
      ...req.body,
      docType: found.doc.docType,
      correctsDocumentId: found.doc.correctsDocumentId,
    })
    const built = await priceDraft(session, input)
    await store.documents.updateOne(
      { _id: found.doc.id, entityId: session.entityId },
      { $set: { ...built, updatedAt: new Date() } },
    )
    res.json({ id: found.doc.id })
  }),
)

documentRoutes.delete(
  '/documents/:id',
  requireRole('accountant'),
  handler(async (req, res) => {
    const session = sessionOf(req)
    const store = await getDb()
    const found = await getDocument(store, session.entityId, param(req, 'id'))
    if (!found) throw notFound('That document no longer exists.')
    // Draft-only, same as the update path — a posted document is refused here
    // in application code, the same place every other write to it is refused.
    if (found.doc.status !== 'draft') {
      throw badRequest('A posted document cannot be deleted. Void it instead.')
    }
    await store.documents.deleteOne({ _id: found.doc.id, entityId: session.entityId })
    res.json({ ok: true })
  }),
)

/** The one-way door: draft becomes posted, and the ledger entry is written. */
documentRoutes.post(
  '/documents/:id/post',
  requireRole('accountant'),
  handler(async (req, res) => {
    const session = sessionOf(req)
    const store = await getDb()
    const found = await getDocument(store, session.entityId, param(req, 'id'))
    if (!found) throw notFound('That document no longer exists.')

    const result = await withTransaction(store, (tx) =>
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
    const store = await getDb()
    const found = await getDocument(store, session.entityId, param(req, 'id'))
    if (!found) throw notFound('That document no longer exists.')

    await withTransaction(store, (tx) =>
      reverseDocument(tx, found.doc.id, { id: session.userId, email: session.email }),
    )
    res.json({ ok: true })
  }),
)

/**
 * Stamps a posted invoice with what the IRP returned. This is the one field
 * set a posted document accepts, and application code is what enforces that —
 * see the comment on postInvoice in domain/posting.ts for why MongoDB itself
 * cannot.
 */
documentRoutes.post(
  '/documents/:id/irn',
  requireRole('accountant'),
  handler(async (req, res) => {
    const session = sessionOf(req)
    const store = await getDb()
    const found = await getDocument(store, session.entityId, param(req, 'id'))
    if (!found) throw notFound('That document no longer exists.')
    if (found.doc.status !== 'posted') throw badRequest('Only a posted document can carry an IRN.')
    if (found.doc.irn) {
      throw badRequest('This invoice already has an IRN. An IRN cannot be replaced once issued.')
    }

    const input = irnSchema.parse(req.body)
    await withTransaction(store, async (tx) => {
      await tx.documents.updateOne(
        { _id: found.doc.id },
        { $set: { ...input, updatedAt: new Date() } },
        { session: tx.session },
      )

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
    const store = await getDb()
    const found = await getDocument(store, session.entityId, param(req, 'id'))
    if (!found) throw notFound('That document no longer exists.')

    const org = await store.entities.findOne({ _id: session.entityId })
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
    const store = await getDb()
    res.json({ rows: await openInvoicesFor(store, session.entityId, param(req, 'id')) })
  }),
)

documentRoutes.post(
  '/payments',
  requireRole('accountant'),
  handler(async (req, res) => {
    const session = sessionOf(req)
    const input = paymentSchema.parse(req.body)
    const store = await getDb()

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

    const party = await store.parties.findOne({ _id: input.partyId, entityId: session.entityId })
    if (!party) throw badRequest('That client no longer exists.')

    // Each allocation is capped at what the invoice still owes, so a stale form
    // cannot over-settle a document someone else just paid.
    for (const target of targets) {
      const open = await openBalanceMinor(store, target.documentId)
      if (target.amountMinor > open) {
        throw badRequest('One of those invoices has already been settled. Reload and try again.')
      }
    }

    const paymentId = newId()
    const partySnapshot: PartySnapshot = {
      name: party.name,
      email: party.email,
      phone: party.phone,
      gstin: party.gstin,
      stateCode: party.stateCode,
      address: formatAddress(party.billingAddress),
    }

    const number = await withTransaction(store, async (tx) => {
      const now = new Date()
      await tx.documents.insertOne(
        {
          _id: paymentId,
          entityId: session.entityId,
          docType: 'payment',
          docNumber: null,
          status: 'draft',
          partyId: party._id,
          partySnapshot,
          issueDate: input.issueDate,
          dueDate: null,
          currency: 'INR',
          fxRate: '1',
          subtotalMinor: amountMinor,
          discountMinor: 0,
          taxMinor: 0,
          totalMinor: amountMinor,
          allocatedMinor: 0,
          discountType: 'fixed',
          discountValue: '0',
          supplyKind: 'exempt',
          placeOfSupply: '',
          correctsDocumentId: null,
          notes: input.reference,
          terms: '',
          irn: null,
          ackNo: null,
          ackDate: null,
          signedQrCode: null,
          postedAt: null,
          postedBy: null,
          voidedAt: null,
          lines: [],
          createdAt: now,
          updatedAt: now,
        },
        { session: tx.session },
      )

      const result = await postPayment(tx, paymentId, targets, {
        id: session.userId,
        email: session.email,
      })
      return result.number
    })

    res.status(201).json({ number })
  }),
)
