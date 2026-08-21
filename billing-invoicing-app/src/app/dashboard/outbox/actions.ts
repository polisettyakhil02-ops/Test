'use server'

import { revalidatePath } from 'next/cache'
import { getDb } from '@/db'
import { requireRole } from '@/lib/session'
import { drainOutbox, retryNow } from '@/domain/webhooks'
import { webhookConfig } from '@/lib/webhook-config'
import type { DeleteResult } from '@/lib/form-state'

/**
 * Drains the queue on demand.
 *
 * The worker script is what runs continuously; this is for the moment you have
 * just fixed the receiver and do not want to wait out the backoff.
 */
export async function deliverNow(): Promise<DeleteResult> {
  await requireRole('admin')

  const config = webhookConfig()
  if (!config) {
    return {
      ok: false,
      message: 'Set WEBHOOK_ENDPOINT and WEBHOOK_SECRET before delivering.',
    }
  }

  const store = await getDb()
  const result = await drainOutbox(store, config)
  revalidatePath('/dashboard/outbox')

  if (result.attempted === 0) return { ok: true, message: 'Nothing was due.' }

  if (result.failed > 0) {
    return {
      ok: false,
      message: `${result.delivered} delivered, ${result.failed} failed: ${result.failures[0].error}`,
    }
  }

  return { ok: true, message: `Delivered ${result.delivered}.` }
}

/** Puts one event back at the front of the queue. */
export async function retryEvent(id: string): Promise<DeleteResult> {
  await requireRole('admin')
  const store = await getDb()
  await retryNow(store, id)
  revalidatePath('/dashboard/outbox')
  return { ok: true, message: 'Queued for the next drain.' }
}
