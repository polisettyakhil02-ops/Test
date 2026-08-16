'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { isValidObjectId } from 'mongoose'
import { auth } from '@/auth'
import { connectToDatabase } from '@/lib/mongodb'
import { Client, type IClient } from '@/models/Client'
import { Invoice } from '@/models/Invoice'
import { invoiceSchema, fieldErrors, type InvoiceInput } from '@/lib/validation'
import { derivePaymentStatus } from '@/lib/invoice-math'
import { formatAddress } from '@/lib/dto'
import type { FormState, DeleteResult } from '@/lib/form-state'

/** Server Actions are public endpoints; the protected layout does not cover them. */
async function requireSession() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }
}

function parseForm(formData: FormData) {
  // Line items are edited as dynamic client state, so they arrive as one JSON
  // blob rather than indexed form fields.
  let lineItems: unknown = []

  try {
    lineItems = JSON.parse(String(formData.get('lineItems') || '[]'))
  } catch {
    lineItems = []
  }

  return invoiceSchema.safeParse({
    client: formData.get('client'),
    issueDate: formData.get('issueDate'),
    dueDate: formData.get('dueDate'),
    status: formData.get('status'),
    lineItems,
    discountType: formData.get('discountType'),
    discountValue: formData.get('discountValue'),
    amountPaid: formData.get('amountPaid'),
    notes: formData.get('notes'),
    terms: formData.get('terms'),
  })
}

/**
 * Builds the document payload, snapshotting the client's details as they are
 * right now. The snapshot is what the invoice and its PDF display, so editing
 * or deleting the client later never rewrites an invoice already issued.
 */
async function buildPayload(parsed: InvoiceInput) {
  const client = await Client.findById(parsed.client).lean<IClient>()

  if (!client) {
    return null
  }

  const issueDate = new Date(`${parsed.issueDate}T00:00:00.000Z`)
  const dueDate = parsed.dueDate ? new Date(`${parsed.dueDate}T00:00:00.000Z`) : null

  const lineItems = parsed.lineItems.map((line) => ({
    item: line.item ?? null,
    description: line.description,
    hsnSac: line.hsnSac,
    unit: line.unit,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    taxRate: line.taxRate,
    // Recomputed by the model's pre-validate hook; never trust the client.
    lineSubtotal: 0,
    lineDiscount: 0,
    lineTaxAmount: 0,
    lineTotal: 0,
  }))

  return {
    client: parsed.client,
    clientSnapshot: {
      name: client.name,
      email: client.email ?? '',
      phone: client.phone ?? '',
      gstin: client.gstin ?? '',
      address: formatAddress({
        line1: client.billingAddress?.line1 ?? '',
        line2: client.billingAddress?.line2 ?? '',
        city: client.billingAddress?.city ?? '',
        state: client.billingAddress?.state ?? '',
        postalCode: client.billingAddress?.postalCode ?? '',
        country: client.billingAddress?.country ?? '',
      }),
    },
    issueDate,
    dueDate,
    lineItems,
    discountType: parsed.discountType,
    discountValue: parsed.discountValue,
    amountPaid: parsed.amountPaid,
    notes: parsed.notes,
    terms: parsed.terms,
    status: parsed.status,
  }
}

export async function createInvoice(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireSession()

  const parsed = parseForm(formData)

  if (!parsed.success) {
    return {
      error: 'Please fix the highlighted fields.',
      fieldErrors: fieldErrors(parsed.error),
    }
  }

  let id: string

  try {
    await connectToDatabase()

    const payload = await buildPayload(parsed.data)

    if (!payload) {
      return { error: 'That client no longer exists.', fieldErrors: {} }
    }

    const invoice = new Invoice(payload)
    // Totals are computed by the pre-validate hook, so the status can only be
    // reconciled against them after validation has run.
    await invoice.validate()
    invoice.status = derivePaymentStatus(
      parsed.data.status,
      invoice.total,
      invoice.amountPaid,
      invoice.dueDate,
    )
    await invoice.save()

    id = invoice._id.toString()
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Could not save the invoice.',
      fieldErrors: {},
    }
  }

  revalidatePath('/dashboard/invoices')
  revalidatePath('/dashboard')
  redirect(`/dashboard/invoices/${id}`)
}

export async function updateInvoice(
  id: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireSession()

  if (!isValidObjectId(id)) {
    return { error: 'That invoice no longer exists.', fieldErrors: {} }
  }

  const parsed = parseForm(formData)

  if (!parsed.success) {
    return {
      error: 'Please fix the highlighted fields.',
      fieldErrors: fieldErrors(parsed.error),
    }
  }

  try {
    await connectToDatabase()

    const invoice = await Invoice.findById(id)

    if (!invoice) {
      return { error: 'That invoice no longer exists.', fieldErrors: {} }
    }

    const payload = await buildPayload(parsed.data)

    if (!payload) {
      return { error: 'That client no longer exists.', fieldErrors: {} }
    }

    // invoiceNumber is deliberately not in the payload: it is assigned once and
    // must never change, or an already-sent invoice would be renumbered.
    invoice.set(payload)
    await invoice.validate()
    invoice.status = derivePaymentStatus(
      parsed.data.status,
      invoice.total,
      invoice.amountPaid,
      invoice.dueDate,
    )
    await invoice.save()
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Could not save the invoice.',
      fieldErrors: {},
    }
  }

  revalidatePath('/dashboard/invoices')
  revalidatePath(`/dashboard/invoices/${id}`)
  revalidatePath('/dashboard')
  redirect(`/dashboard/invoices/${id}`)
}

export async function deleteInvoice(id: string): Promise<DeleteResult> {
  await requireSession()

  if (!isValidObjectId(id)) {
    return { ok: false, message: 'That invoice no longer exists.' }
  }

  try {
    await connectToDatabase()
    const deleted = await Invoice.findByIdAndDelete(id)

    if (!deleted) {
      return { ok: false, message: 'That invoice no longer exists.' }
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Could not delete the invoice.',
    }
  }

  revalidatePath('/dashboard/invoices')
  revalidatePath('/dashboard')
  return { ok: true, message: 'Invoice deleted.' }
}

/** Quick status change from the invoice detail page. */
export async function setInvoiceStatus(
  id: string,
  status: string,
): Promise<DeleteResult> {
  await requireSession()

  if (!isValidObjectId(id)) {
    return { ok: false, message: 'That invoice no longer exists.' }
  }

  const allowed = ['draft', 'sent', 'paid', 'partially_paid', 'overdue', 'cancelled']

  if (!allowed.includes(status)) {
    return { ok: false, message: 'Unknown status.' }
  }

  try {
    await connectToDatabase()

    const invoice = await Invoice.findById(id)

    if (!invoice) {
      return { ok: false, message: 'That invoice no longer exists.' }
    }

    // Marking an invoice paid should settle the balance too, otherwise the
    // dashboard would report it as paid while still counting it as outstanding.
    if (status === 'paid') {
      invoice.amountPaid = invoice.total
    }

    invoice.status = status as typeof invoice.status
    await invoice.save()
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Could not update the invoice.',
    }
  }

  revalidatePath('/dashboard/invoices')
  revalidatePath(`/dashboard/invoices/${id}`)
  revalidatePath('/dashboard')
  return { ok: true, message: 'Invoice updated.' }
}
