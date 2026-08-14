'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { isValidObjectId } from 'mongoose'
import { auth } from '@/auth'
import { connectToDatabase } from '@/lib/mongodb'
import { Client } from '@/models/Client'
import { Invoice } from '@/models/Invoice'
import { clientSchema, fieldErrors } from '@/lib/validation'
import type { FormState, DeleteResult } from '@/lib/form-state'

/**
 * Server Actions are public HTTP endpoints -- being rendered inside a
 * protected layout does not protect the action itself. Every one re-checks.
 */
async function requireSession() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }
}

function parseForm(formData: FormData) {
  return clientSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    gstin: formData.get('gstin'),
    notes: formData.get('notes'),
    billingAddress: {
      line1: formData.get('line1'),
      line2: formData.get('line2'),
      city: formData.get('city'),
      state: formData.get('state'),
      postalCode: formData.get('postalCode'),
      country: formData.get('country'),
    },
  })
}

export async function createClient(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireSession()

  const parsed = parseForm(formData)

  if (!parsed.success) {
    return { error: 'Please fix the highlighted fields.', fieldErrors: fieldErrors(parsed.error) }
  }

  try {
    await connectToDatabase()
    await Client.create(parsed.data)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Could not save the client.',
      fieldErrors: {},
    }
  }

  revalidatePath('/dashboard/clients')
  redirect('/dashboard/clients')
}

export async function updateClient(
  id: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireSession()

  if (!isValidObjectId(id)) {
    return { error: 'That client no longer exists.', fieldErrors: {} }
  }

  const parsed = parseForm(formData)

  if (!parsed.success) {
    return { error: 'Please fix the highlighted fields.', fieldErrors: fieldErrors(parsed.error) }
  }

  try {
    await connectToDatabase()
    const updated = await Client.findByIdAndUpdate(id, parsed.data, {
      new: true,
      runValidators: true,
    })

    if (!updated) {
      return { error: 'That client no longer exists.', fieldErrors: {} }
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Could not save the client.',
      fieldErrors: {},
    }
  }

  revalidatePath('/dashboard/clients')
  revalidatePath(`/dashboard/clients/${id}/edit`)
  redirect('/dashboard/clients')
}

export async function deleteClient(id: string): Promise<DeleteResult> {
  await requireSession()

  if (!isValidObjectId(id)) {
    return { ok: false, message: 'That client no longer exists.' }
  }

  try {
    await connectToDatabase()

    // Invoices snapshot their client, but the reference is still what links an
    // invoice back to a live client record -- deleting one out from under an
    // existing invoice would orphan it.
    const invoiceCount = await Invoice.countDocuments({ client: id })

    if (invoiceCount > 0) {
      return {
        ok: false,
        message: `This client has ${invoiceCount} invoice${
          invoiceCount === 1 ? '' : 's'
        } and cannot be deleted.`,
      }
    }

    const deleted = await Client.findByIdAndDelete(id)

    if (!deleted) {
      return { ok: false, message: 'That client no longer exists.' }
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Could not delete the client.',
    }
  }

  revalidatePath('/dashboard/clients')
  return { ok: true, message: 'Client deleted.' }
}
