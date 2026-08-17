'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { documents, entities, parties } from '@/db/schema'
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
  openBalanceMinor,
  postInvoice,
  postPayment,
  recordAudit,
  replaceDocumentLines,
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

/** Prices a draft and writes it, header and lines together. */
async function saveDraft(
  session: { entityId: string; userId: string; email: string },
  input: InvoiceInput,
  options: { documentId?: string; docType: 'invoice' | 'credit_note'; correctsDocumentId?: string },
) {
  const [party] = await db
    .select()
    .from(parties)
    .where(and(eq(parties.entityId, session.entityId), eq(parties.id, input.partyId)))
    .limit(1)

  if (!party) throw new Error('That client no longer exists.')

  const [org] = await db
    .select()
    .from(entities)
    .where(eq(entities.id, session.entityId))
    .limit(1)

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
    docType: options.docType,
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
    correctsDocumentId: options.correctsDocumentId ?? null,
    updatedAt: new Date(),
  }

  return db.transaction(async (tx) => {
    let documentId = options.documentId

    if (documentId) {
      await tx.update(documents).set(header).where(eq(documents.id, documentId))
    } else {
      const [created] = await tx.insert(documents).values(header).returning()
      documentId = created.id
    }

    await replaceDocumentLines(
      tx,
      documentId,
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

    return documentId
  })
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

  const [existing] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.entityId, session.entityId), eq(documents.id, documentId)))
    .limit(1)

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
    const result = await db.transaction(async (tx) =>
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
    await db.transaction(async (tx) =>
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
    // The database refuses this for anything not a draft, so there is no way to
    // delete a posted document even by mistake.
    await db
      .delete(documents)
      .where(and(eq(documents.entityId, session.entityId), eq(documents.id, documentId)))
  } catch (error) {
    const cause = (error as { cause?: { message?: string } })?.cause
    return {
      ok: false,
      message: cause?.message ?? (error instanceof Error ? error.message : 'Could not delete.'),
    }
  }

  revalidatePath('/dashboard/invoices')
  return { ok: true, message: 'Draft deleted.' }
}

/**
 * Stamps a posted invoice with what the IRP returned.
 *
 * The database allows this exact update and nothing else on a posted document:
 * write-once, and no other column may ride along with it. See the
 * `refuse_posted_document_edit` guard — the rule is enforced there rather than
 * here, so a future code path cannot get it wrong.
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

  const [existing] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.entityId, session.entityId), eq(documents.id, documentId)))
    .limit(1)

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
    await db.transaction(async (tx) => {
      await tx
        .update(documents)
        .set({
          irn: parsed.data.irn,
          ackNo: parsed.data.ackNo,
          ackDate: parsed.data.ackDate,
          signedQrCode: parsed.data.signedQrCode,
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId))

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
    const cause = (error as { cause?: { message?: string } })?.cause
    return {
      error: cause?.message ?? (error instanceof Error ? error.message : 'Could not record.'),
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
    const [party] = await db
      .select()
      .from(parties)
      .where(and(eq(parties.entityId, session.entityId), eq(parties.id, parsed.data.partyId)))
      .limit(1)

    if (!party) return { error: 'That client no longer exists.', fieldErrors: {} }

    // Each allocation is capped at what the invoice still owes, so a stale form
    // cannot over-settle a document someone else just paid.
    for (const target of targets) {
      const open = await openBalanceMinor(db, target.documentId)
      if (target.amountMinor > open) {
        return {
          error: 'One of those invoices has already been settled. Reload and try again.',
          fieldErrors: {},
        }
      }
    }

    await db.transaction(async (tx) => {
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
          issueDate: parsed.data.issueDate,
          totalMinor: amountMinor,
          subtotalMinor: amountMinor,
          notes: parsed.data.reference,
        })
        .returning()

      await postPayment(tx, payment.id, targets, {
        id: session.userId,
        email: session.email,
      })
    })
  } catch (error) {
    if (error instanceof PostingError) return { error: error.message, fieldErrors: {} }
    const cause = (error as { cause?: { message?: string } })?.cause
    return {
      error: cause?.message ?? (error instanceof Error ? error.message : 'Could not record.'),
      fieldErrors: {},
    }
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/invoices')
  redirect('/dashboard/invoices?docType=payment')
}
