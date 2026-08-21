'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getDb, withTransaction } from '@/db'
import { newId } from '@/db/ids'
import type { DocumentDoc, PartySnapshot } from '@/db/collections'
import { requireRole } from '@/lib/session'
import {
  invoiceSchema,
  irnSchema,
  paymentSchema,
  fieldErrors,
  type InvoiceInput,
} from '@/lib/validation'
import { parseMinor } from '@/domain/money'
import { priceDocument, resolveSupplyKind } from '@/domain/pricing'
import {
  PostingError,
  buildDocumentLines,
  openBalanceMinor,
  postInvoice,
  postPayment,
  recordAudit,
  reverseDocument,
} from '@/domain/posting'
import { formatAddress } from '@/lib/dto'
import type { FormState, DeleteResult } from '@/lib/form-state'

function parseInvoiceForm(formData: FormData) {
  let lines: unknown = []
  try {
    lines = JSON.parse(String(formData.get('lines') || '[]'))
  } catch {
    lines = []
  }

  return invoiceSchema.safeParse({
    partyId: formData.get('partyId'),
    issueDate: formData.get('issueDate'),
    dueDate: formData.get('dueDate'),
    lines,
    discountType: formData.get('discountType'),
    discountValue: formData.get('discountValue'),
    notes: formData.get('notes'),
    terms: formData.get('terms'),
  })
}

/** Prices a draft into a full document — header and lines together, one write. */
async function saveDraft(
  session: { entityId: string },
  input: InvoiceInput,
  options: { documentId?: string; docType: 'invoice' | 'credit_note'; correctsDocumentId?: string },
): Promise<string> {
  const store = await getDb()
  const party = await store.parties.findOne({ _id: input.partyId, entityId: session.entityId })
  if (!party) throw new Error('That client no longer exists.')

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

  const lines = buildDocumentLines(
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

  if (options.documentId) {
    await store.documents.updateOne(
      { _id: options.documentId },
      {
        $set: {
          partyId: party._id,
          partySnapshot,
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
          lines,
          updatedAt: new Date(),
        },
      },
    )
    return options.documentId
  }

  const id = newId()
  const now = new Date()
  const doc: DocumentDoc = {
    _id: id,
    entityId: session.entityId,
    docType: options.docType,
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
    correctsDocumentId: options.correctsDocumentId ?? null,
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
    createdAt: now,
    updatedAt: now,
  }
  await store.documents.insertOne(doc)
  return id
}

export async function createInvoice(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireRole('accountant')
  const parsed = parseInvoiceForm(formData)

  if (!parsed.success) {
    return { error: 'Please fix the highlighted fields.', fieldErrors: fieldErrors(parsed.error) }
  }

  const docType = String(formData.get('docType') || 'invoice') as 'invoice' | 'credit_note'
  const corrects = String(formData.get('correctsDocumentId') || '') || undefined

  let id: string
  try {
    id = await saveDraft(session, parsed.data, { docType, correctsDocumentId: corrects })
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not save.', fieldErrors: {} }
  }

  revalidatePath('/dashboard/invoices')
  redirect(`/dashboard/invoices/${id}`)
}

export async function updateInvoice(
  documentId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireRole('accountant')
  const parsed = parseInvoiceForm(formData)

  if (!parsed.success) {
    return { error: 'Please fix the highlighted fields.', fieldErrors: fieldErrors(parsed.error) }
  }

  const store = await getDb()
  const existing = await store.documents.findOne({ _id: documentId, entityId: session.entityId })

  if (!existing) return { error: 'That document no longer exists.', fieldErrors: {} }
  if (existing.status !== 'draft') {
    return {
      error: 'This document is posted and cannot be edited. Raise a credit note instead.',
      fieldErrors: {},
    }
  }

  try {
    await saveDraft(session, parsed.data, {
      documentId,
      docType: existing.docType as 'invoice' | 'credit_note',
      correctsDocumentId: existing.correctsDocumentId ?? undefined,
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not save.', fieldErrors: {} }
  }

  revalidatePath('/dashboard/invoices')
  revalidatePath(`/dashboard/invoices/${documentId}`)
  redirect(`/dashboard/invoices/${documentId}`)
}

/** The one-way door: draft becomes posted, and the ledger entry is written. */
export async function postDocument(documentId: string): Promise<DeleteResult> {
  const session = await requireRole('accountant')

  try {
    const store = await getDb()
    const result = await withTransaction(store, (tx) =>
      postInvoice(tx, documentId, { id: session.userId, email: session.email }),
    )
    revalidatePath('/dashboard')
    revalidatePath('/dashboard/invoices')
    revalidatePath(`/dashboard/invoices/${documentId}`)
    return { ok: true, message: `Posted as ${result.number}.` }
  } catch (error) {
    if (error instanceof PostingError) return { ok: false, message: error.message }
    return { ok: false, message: error instanceof Error ? error.message : 'Could not post.' }
  }
}

export async function voidDocument(documentId: string): Promise<DeleteResult> {
  const session = await requireRole('admin')

  try {
    const store = await getDb()
    await withTransaction(store, (tx) =>
      reverseDocument(tx, documentId, { id: session.userId, email: session.email }),
    )
    revalidatePath('/dashboard')
    revalidatePath('/dashboard/invoices')
    revalidatePath(`/dashboard/invoices/${documentId}`)
    return { ok: true, message: 'Voided with a reversing entry.' }
  } catch (error) {
    if (error instanceof PostingError) return { ok: false, message: error.message }
    return { ok: false, message: error instanceof Error ? error.message : 'Could not void.' }
  }
}

export async function deleteDraft(documentId: string): Promise<DeleteResult> {
  const session = await requireRole('accountant')

  try {
    const store = await getDb()
    const existing = await store.documents.findOne({ _id: documentId, entityId: session.entityId })
    if (!existing) return { ok: false, message: 'That document no longer exists.' }
    // A posted document is refused here, in application code -- the same place
    // every other write to a posted document is refused. MongoDB has no
    // trigger to fall back on the way the Postgres version did.
    if (existing.status !== 'draft') {
      return { ok: false, message: 'A posted document cannot be deleted. Void it instead.' }
    }
    await store.documents.deleteOne({ _id: documentId, entityId: session.entityId })
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not delete.' }
  }

  revalidatePath('/dashboard/invoices')
  return { ok: true, message: 'Draft deleted.' }
}

/**
 * Stamps a posted invoice with what the IRP returned.
 *
 * This is the one field set a posted document accepts, and application code is
 * what enforces that -- see the comment on `postInvoice` in
 * `domain/posting.ts` for why MongoDB itself cannot the way the Postgres
 * `refuse_posted_document_edit` guard did.
 */
export async function recordIrn(
  documentId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireRole('accountant')

  const parsed = irnSchema.safeParse({
    irn: formData.get('irn'),
    ackNo: formData.get('ackNo'),
    ackDate: formData.get('ackDate'),
    signedQrCode: formData.get('signedQrCode'),
  })

  if (!parsed.success) {
    return { error: 'Please fix the highlighted fields.', fieldErrors: fieldErrors(parsed.error) }
  }

  const store = await getDb()
  const existing = await store.documents.findOne({ _id: documentId, entityId: session.entityId })

  if (!existing) return { error: 'That document no longer exists.', fieldErrors: {} }
  if (existing.status !== 'posted') {
    return { error: 'Only a posted document can carry an IRN.', fieldErrors: {} }
  }
  if (existing.irn) {
    return {
      error: 'This invoice already has an IRN. An IRN cannot be replaced once issued.',
      fieldErrors: {},
    }
  }

  try {
    await withTransaction(store, async (tx) => {
      await tx.documents.updateOne(
        { _id: documentId },
        {
          $set: {
            irn: parsed.data.irn,
            ackNo: parsed.data.ackNo,
            ackDate: parsed.data.ackDate,
            signedQrCode: parsed.data.signedQrCode,
            updatedAt: new Date(),
          },
        },
        { session: tx.session },
      )

      await recordAudit(tx, {
        entityId: session.entityId,
        actorId: session.userId,
        actorEmail: session.email,
        action: 'einvoice.record',
        recordType: 'document',
        recordId: documentId,
        after: { irn: parsed.data.irn, ackNo: parsed.data.ackNo, ackDate: parsed.data.ackDate },
      })
    })
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Could not record.',
      fieldErrors: {},
    }
  }

  revalidatePath(`/dashboard/invoices/${documentId}`)
  redirect(`/dashboard/invoices/${documentId}`)
}

/** Records a receipt and settles it against the chosen invoices. */
export async function recordPayment(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireRole('accountant')

  let allocations: unknown = []
  try {
    allocations = JSON.parse(String(formData.get('allocations') || '[]'))
  } catch {
    allocations = []
  }

  const parsed = paymentSchema.safeParse({
    partyId: formData.get('partyId'),
    issueDate: formData.get('issueDate'),
    amount: formData.get('amount'),
    reference: formData.get('reference'),
    allocations,
  })

  if (!parsed.success) {
    return { error: 'Please fix the highlighted fields.', fieldErrors: fieldErrors(parsed.error) }
  }

  const amountMinor = parseMinor(parsed.data.amount)
  const targets = parsed.data.allocations
    .map((a) => ({ documentId: a.documentId, amountMinor: parseMinor(a.amount) }))
    .filter((a) => a.amountMinor > 0)

  const allocatedTotal = targets.reduce((sum, t) => sum + t.amountMinor, 0)

  if (allocatedTotal > amountMinor) {
    return {
      error: 'You have allocated more than the payment amount.',
      fieldErrors: { amount: 'Allocations exceed this payment' },
    }
  }

  try {
    const store = await getDb()
    const party = await store.parties.findOne({ _id: parsed.data.partyId, entityId: session.entityId })
    if (!party) return { error: 'That client no longer exists.', fieldErrors: {} }

    // Each allocation is capped at what the invoice still owes, so a stale form
    // cannot over-settle a document someone else just paid. The transactional
    // allocation guard in `domain/posting.ts` is the real enforcement; this is
    // just a friendlier error than the generic one it would otherwise throw.
    for (const target of targets) {
      const open = await openBalanceMinor(store, target.documentId)
      if (target.amountMinor > open) {
        return {
          error: 'One of those invoices has already been settled. Reload and try again.',
          fieldErrors: {},
        }
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

    await withTransaction(store, async (tx) => {
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
          issueDate: parsed.data.issueDate,
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
          notes: parsed.data.reference,
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

      await postPayment(tx, paymentId, targets, { id: session.userId, email: session.email })
    })
  } catch (error) {
    if (error instanceof PostingError) return { error: error.message, fieldErrors: {} }
    return {
      error: error instanceof Error ? error.message : 'Could not record.',
      fieldErrors: {},
    }
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/invoices')
  redirect('/dashboard/invoices?docType=payment')
}
