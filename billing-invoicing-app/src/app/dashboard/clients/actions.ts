'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { documents, parties } from '@/db/schema'
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
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(parties)
        .values({ ...parsed.data, entityId: session.entityId, gstin: parsed.data.gstin.toUpperCase() })
        .returning()

      await recordAudit(tx, {
        entityId: session.entityId,
        actorId: session.userId,
        actorEmail: session.email,
        action: 'create',
        recordType: 'party',
        recordId: created.id,
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
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(parties)
        .where(and(eq(parties.entityId, session.entityId), eq(parties.id, id)))
        .limit(1)

      if (!before) throw new Error('That client no longer exists.')

      const [after] = await tx
        .update(parties)
        .set({ ...parsed.data, gstin: parsed.data.gstin.toUpperCase() })
        .where(eq(parties.id, id))
        .returning()

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
    const [{ count }] = await db
      .select({ count: sql<string>`COUNT(*)` })
      .from(documents)
      .where(eq(documents.partyId, id))

    // Documents snapshot the party, but the reference is what links a document
    // back to a live record -- deleting it would orphan them.
    if (Number(count) > 0) {
      return {
        ok: false,
        message: `This client has ${count} document${Number(count) === 1 ? '' : 's'} and cannot be deleted.`,
      }
    }

    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(parties).where(eq(parties.id, id)).limit(1)
      await tx.delete(parties).where(eq(parties.id, id))
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
