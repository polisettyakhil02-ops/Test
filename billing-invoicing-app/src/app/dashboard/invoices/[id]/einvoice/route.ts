import { requireRole } from '@/lib/session'
import { einvoiceInputFor } from '@/lib/einvoice-input'
import { buildEinvoicePayload, einvoiceBlockers } from '@/domain/einvoice'

export const dynamic = 'force-dynamic'

/**
 * The IRP payload for one document, as a downloadable file.
 *
 * If the document is not registrable the blockers come back as JSON with a 422
 * rather than a broken payload with a 200 — the UI shows them, and anyone
 * scripting against this endpoint gets a machine-readable reason.
 */
export async function GET(
  request: Request,
  context: RouteContext<'/dashboard/invoices/[id]/einvoice'>,
) {
  const session = await requireRole('accountant')
  const { id } = await context.params

  const found = await einvoiceInputFor(session.entityId, id)
  if (!found) return new Response('Not found', { status: 404 })

  const blockers = einvoiceBlockers(found.input)
  if (blockers.length > 0) {
    return Response.json({ blockers }, { status: 422 })
  }

  const payload = buildEinvoicePayload(found.input)
  const filename = `einvoice-${found.docNumber ?? id}.json`

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
