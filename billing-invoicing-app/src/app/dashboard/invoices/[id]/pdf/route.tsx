import { renderToBuffer } from '@react-pdf/renderer'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { entities } from '@/db/schema'
import { requireSession } from '@/lib/session'
import { getDocument } from '@/lib/queries'
import { InvoicePdf } from '@/lib/pdf/invoice-pdf'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  request: Request,
  context: RouteContext<'/dashboard/invoices/[id]/pdf'>,
) {
  // proxy.ts guards /dashboard/*, but a route handler is a public endpoint in
  // its own right.
  const session = await requireSession()
  const { id } = await context.params

  const found = await getDocument(session.entityId, id).catch(() => null)
  if (!found) return new Response('Not found', { status: 404 })

  const [org] = await db
    .select()
    .from(entities)
    .where(eq(entities.id, session.entityId))
    .limit(1)

  const buffer = await renderToBuffer(
    <InvoicePdf
      invoice={{
        docType: found.doc.docType,
        docNumber: found.doc.docNumber,
        status: found.doc.status,
        partySnapshot: found.doc.partySnapshot,
        issueDate: found.doc.issueDate,
        dueDate: found.doc.dueDate,
        subtotalMinor: found.doc.subtotalMinor,
        discountMinor: found.doc.discountMinor,
        totalMinor: found.doc.totalMinor,
        allocatedMinor: found.allocatedMinor,
        discountType: found.doc.discountType,
        discountValue: found.doc.discountValue,
        supplyKind: found.doc.supplyKind,
        notes: found.doc.notes,
        terms: found.doc.terms,
        lines: found.lines.map((line) => ({
          id: line.id,
          description: line.description,
          hsnSac: line.hsnSac,
          unit: line.unit,
          quantity: line.quantity,
          unitPriceMinor: line.unitPriceMinor,
          taxRatePercent: line.taxRatePercent,
          lineSubtotalMinor: line.lineSubtotalMinor,
          lineDiscountMinor: line.lineDiscountMinor,
          lineTaxMinor: line.lineTaxMinor,
          lineTotalMinor: line.lineTotalMinor,
        })),
      }}
      company={{
        name: org?.name ?? 'Company',
        addressLines: org?.addressLines ?? [],
        gstin: org?.gstin ?? '',
        email: org?.email ?? '',
        phone: org?.phone ?? '',
        bankDetails: org?.bankDetails ?? '',
        footerNote: 'This is a computer-generated document.',
      }}
    />,
  )

  const url = new URL(request.url)
  const disposition = url.searchParams.get('download') ? 'attachment' : 'inline'
  const filename = `${found.doc.docNumber ?? 'draft'}.pdf`

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="${filename}"`,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'no-store',
    },
  })
}
