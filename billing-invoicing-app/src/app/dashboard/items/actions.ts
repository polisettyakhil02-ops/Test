'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getDb, withTransaction } from '@/db'
import { newId } from '@/db/ids'
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
    const store = await getDb()
    await withTransaction(store, async (tx) => {
      const created = {
        _id: newId(),
        entityId: session.entityId,
        name: parsed.data.name,
        description: parsed.data.description,
        hsnSac: parsed.data.hsnSac,
        unit: parsed.data.unit,
        unitPriceMinor: parseMinor(parsed.data.unitPrice),
        defaultTaxRatePercent: parsed.data.taxRatePercent,
        incomeAccountId: null,
        isActive: true,
        createdAt: new Date(),
      }
      await tx.items.insertOne(created, { session: tx.session })

      await recordAudit(tx, {
        entityId: session.entityId,
        actorId: session.userId,
        actorEmail: session.email,
        action: 'create',
        recordType: 'item',
        recordId: created._id,
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
    const store = await getDb()
    await withTransaction(store, async (tx) => {
      const before = await tx.items.findOne(
        { _id: id, entityId: session.entityId },
        { session: tx.session },
      )
      if (!before) throw new Error('That item no longer exists.')

      const after = await tx.items.findOneAndUpdate(
        { _id: id },
        {
          $set: {
            name: parsed.data.name,
            description: parsed.data.description,
            hsnSac: parsed.data.hsnSac,
            unit: parsed.data.unit,
            unitPriceMinor: parseMinor(parsed.data.unitPrice),
            defaultTaxRatePercent: parsed.data.taxRatePercent,
          },
        },
        { session: tx.session, returnDocument: 'after' },
      )

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
    const store = await getDb()
    await withTransaction(store, async (tx) => {
      const before = await tx.items.findOne({ _id: id }, { session: tx.session })
      // Safe to delete: document lines snapshot the item's details, and a
      // line's itemId simply stays pointing at nothing once it is gone -- an
      // issued document is unaffected either way.
      await tx.items.deleteOne({ _id: id }, { session: tx.session })
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
