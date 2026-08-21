'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getDb, withTransaction } from '@/db'
import { newId } from '@/db/ids'
import { requireRole } from '@/lib/session'
import { partySchema, fieldErrors } from '@/lib/validation'
import { recordAudit } from '@/domain/posting'
import type { FormState, DeleteResult } from '@/lib/form-state'

function parseForm(formData: FormData) {
  return partySchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    gstin: formData.get('gstin'),
    stateCode: formData.get('stateCode'),
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

export async function createParty(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireRole('accountant')
  const parsed = parseForm(formData)

  if (!parsed.success) {
    return { error: 'Please fix the highlighted fields.', fieldErrors: fieldErrors(parsed.error) }
  }

  try {
    const store = await getDb()
    await withTransaction(store, async (tx) => {
      const created = {
        _id: newId(),
        entityId: session.entityId,
        ...parsed.data,
        gstin: parsed.data.gstin.toUpperCase(),
        isCustomer: true,
        isVendor: false,
        isActive: true,
        createdAt: new Date(),
      }
      await tx.parties.insertOne(created, { session: tx.session })

      await recordAudit(tx, {
        entityId: session.entityId,
        actorId: session.userId,
        actorEmail: session.email,
        action: 'create',
        recordType: 'party',
        recordId: created._id,
        after: created,
      })
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not save.', fieldErrors: {} }
  }

  revalidatePath('/dashboard/clients')
  redirect('/dashboard/clients')
}

export async function updateParty(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireRole('accountant')
  const parsed = parseForm(formData)

  if (!parsed.success) {
    return { error: 'Please fix the highlighted fields.', fieldErrors: fieldErrors(parsed.error) }
  }

  try {
    const store = await getDb()
    await withTransaction(store, async (tx) => {
      const before = await tx.parties.findOne(
        { _id: id, entityId: session.entityId },
        { session: tx.session },
      )
      if (!before) throw new Error('That client no longer exists.')

      const after = await tx.parties.findOneAndUpdate(
        { _id: id },
        { $set: { ...parsed.data, gstin: parsed.data.gstin.toUpperCase() } },
        { session: tx.session, returnDocument: 'after' },
      )

      await recordAudit(tx, {
        entityId: session.entityId,
        actorId: session.userId,
        actorEmail: session.email,
        action: 'update',
        recordType: 'party',
        recordId: id,
        before,
        after,
      })
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not save.', fieldErrors: {} }
  }

  revalidatePath('/dashboard/clients')
  redirect('/dashboard/clients')
}

export async function deleteParty(id: string): Promise<DeleteResult> {
  const session = await requireRole('admin')

  try {
    const store = await getDb()

    // Documents snapshot the party, but the reference is what links a document
    // back to a live record -- deleting it would orphan them. MongoDB has no
    // foreign key to refuse this on its own, so it is checked here.
    const count = await store.documents.countDocuments({ partyId: id })
    if (count > 0) {
      return {
        ok: false,
        message: `This client has ${count} document${count === 1 ? '' : 's'} and cannot be deleted.`,
      }
    }

    await withTransaction(store, async (tx) => {
      const before = await tx.parties.findOne({ _id: id }, { session: tx.session })
      await tx.parties.deleteOne({ _id: id }, { session: tx.session })
      await recordAudit(tx, {
        entityId: session.entityId,
        actorId: session.userId,
        actorEmail: session.email,
        action: 'delete',
        recordType: 'party',
        recordId: id,
        before,
      })
    })
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not delete.' }
  }

  revalidatePath('/dashboard/clients')
  return { ok: true, message: 'Client deleted.' }
}
