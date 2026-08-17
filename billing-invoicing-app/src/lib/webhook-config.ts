import type { DrainOptions } from '@/domain/webhooks'

/**
 * Where posted events go, if anywhere.
 *
 * Both halves are required: an endpoint without a secret would mean unsigned
 * deliveries, and a receiver that cannot verify a delivery cannot safely act on
 * one. Returning null rather than a partially-configured object means the
 * caller has to handle "not set up" explicitly.
 */
export function webhookConfig(): Pick<DrainOptions, 'endpoint' | 'secret'> | null {
  const endpoint = process.env.WEBHOOK_ENDPOINT?.trim()
  const secret = process.env.WEBHOOK_SECRET?.trim()

  if (!endpoint || !secret) return null
  return { endpoint, secret }
}
