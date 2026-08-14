'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { isValidObjectId } from 'mongoose'
import { auth } from '@/auth'
import { connectToDatabase } from '@/lib/mongodb'
import { Item } from '@/models/Item'
import { Invoice } from '@/models/Invoice'
import { itemSchema, fieldErrors } from '@/lib/validation'
import type { FormState, DeleteResult } from '@/lib/form-state'

/** Server Actions are public endpoints; the protected layout does not cover them. */
async function requireSession() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }
}

function parseForm(formData: FormData) {
  return itemSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description'),
    hsnSac: formData.get('hsnSac'),
    unit: formData.get('unit'),
    price: formData.get('price'),
    taxRate: formData.get('taxRate'),
  })
}

export async function createItem(
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

  try {
    await connectToDatabase()
    await Item.create(parsed.data)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Could not save the item.',
      fieldErrors: {},
    }
  }

  revalidatePath('/dashboard/items')
  redirect('/dashboard/items')
}

export async function updateItem(
  id: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireSession()

  if (!isValidObjectId(id)) {
    return { error: 'That item no longer exists.', fieldErrors: {} }
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
    const updated = await Item.findByIdAndUpdate(id, parsed.data, {
      new: true,
      runValidators: true,
    })

    if (!updated) {
      return { error: 'That item no longer exists.', fieldErrors: {} }
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Could not save the item.',
      fieldErrors: {},
    }
  }

  revalidatePath('/dashboard/items')
  revalidatePath(`/dashboard/items/${id}/edit`)
  redirect('/dashboard/items')
}

export async function deleteItem(id: string): Promise<DeleteResult> {
  await requireSession()

  if (!isValidObjectId(id)) {
    return { ok: false, message: 'That item no longer exists.' }
  }

  try {
    await connectToDatabase()

    const deleted = await Item.findByIdAndDelete(id)

    if (!deleted) {
      return { ok: false, message: 'That item no longer exists.' }
    }

    // Unlike clients, items are safe to delete -- invoice lines snapshot the
    // description, price and tax rate, so past invoices still render exactly
    // as issued. MongoDB has no cascading delete though, so the line's `item`
    // reference would dangle; clear it explicitly rather than leave a pointer
    // to a document that no longer exists.
    await Invoice.updateMany(
      { 'lineItems.item': id },
      { $set: { 'lineItems.$[line].item': null } },
      { arrayFilters: [{ 'line.item': id }] },
    )
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Could not delete the item.',
    }
  }

  revalidatePath('/dashboard/items')
  return { ok: true, message: 'Item deleted.' }
}
