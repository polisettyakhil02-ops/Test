'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { items } from '@/db/schema'
import { requireRole } from '@/lib/session'
import { itemSchema, fieldErrors } from '@/lib/validation'
import { parseMinor } from '@/domain/money'
import { recordAudit } from '@/domain/posting'
import type { FormState, DeleteResult } from '@/lib/form-state'

function parseForm(formData: FormData) {
  return itemSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description'),
    hsnSac: formData.get('hsnSac'),
    unit: formData.get('unit'),
    unitPrice: formData.get('unitPrice'),
    taxRatePercent: formData.get('taxRatePercent'),
  })
}

export async function createItem(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireRole('accountant')
  const parsed = parseForm(formData)

  if (!parsed.success) {
    return { error: 'Please fix the highlighted fields.', fieldErrors: fieldErrors(parsed.error) }
  }

  try {
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(items)
        .values({
          entityId: session.entityId,
          name: parsed.data.name,
          description: parsed.data.description,
          hsnSac: parsed.data.hsnSac,
          unit: parsed.data.unit,
          unitPriceMinor: parseMinor(parsed.data.unitPrice),
          defaultTaxRatePercent: parsed.data.taxRatePercent,
        })
        .returning()

      await recordAudit(tx, {
        entityId: session.entityId,
        actorId: session.userId,
        actorEmail: session.email,
        action: 'create',
        recordType: 'item',
        recordId: created.id,
        after: created,
      })
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not save.', fieldErrors: {} }
  }

  revalidatePath('/dashboard/items')
  redirect('/dashboard/items')
}

export async function updateItem(
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
        .from(items)
        .where(and(eq(items.entityId, session.entityId), eq(items.id, id)))
        .limit(1)

      if (!before) throw new Error('That item no longer exists.')

      const [after] = await tx
        .update(items)
        .set({
          name: parsed.data.name,
          description: parsed.data.description,
          hsnSac: parsed.data.hsnSac,
          unit: parsed.data.unit,
          unitPriceMinor: parseMinor(parsed.data.unitPrice),
          defaultTaxRatePercent: parsed.data.taxRatePercent,
        })
        .where(eq(items.id, id))
        .returning()

      await recordAudit(tx, {
        entityId: session.entityId,
        actorId: session.userId,
        actorEmail: session.email,
        action: 'update',
        recordType: 'item',
        recordId: id,
        before,
        after,
      })
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not save.', fieldErrors: {} }
  }

  revalidatePath('/dashboard/items')
  redirect('/dashboard/items')
}

export async function deleteItem(id: string): Promise<DeleteResult> {
  const session = await requireRole('admin')

  try {
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(items).where(eq(items.id, id)).limit(1)
      // Safe to delete: document lines snapshot the item's details, and the
      // line's item_id is ON DELETE SET NULL, so issued documents are untouched.
      await tx.delete(items).where(eq(items.id, id))
      await recordAudit(tx, {
        entityId: session.entityId,
        actorId: session.userId,
        actorEmail: session.email,
        action: 'delete',
        recordType: 'item',
        recordId: id,
        before,
      })
    })
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not delete.' }
  }

  revalidatePath('/dashboard/items')
  return { ok: true, message: 'Item deleted.' }
}
