import { isValidObjectId } from 'mongoose'
import { renderToBuffer } from '@react-pdf/renderer'
import { auth } from '@/auth'
import { connectToDatabase } from '@/lib/mongodb'
import { Invoice } from '@/models/Invoice'
import { toInvoiceDTO } from '@/lib/dto'
import { getCompanyDetails } from '@/lib/company'
import { InvoicePdf } from '@/lib/pdf/invoice-pdf'

// The PDF is generated per request from live data and must never be cached or
// prerendered; @react-pdf/renderer also needs the Node runtime.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  request: Request,
  context: RouteContext<'/dashboard/invoices/[id]/pdf'>,
) {
  // proxy.ts already guards /dashboard/*, but a route handler is a public
  // endpoint in its own right, so check here too.
  const session = await auth()

  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { id } = await context.params

  if (!isValidObjectId(id)) {
    return new Response('Not found', { status: 404 })
  }

  await connectToDatabase()
  const doc = await Invoice.findById(id).lean()

  if (!doc) {
    return new Response('Not found', { status: 404 })
  }

  const invoice = toInvoiceDTO(doc as Parameters<typeof toInvoiceDTO>[0])
  const company = getCompanyDetails()

  const buffer = await renderToBuffer(
    <InvoicePdf invoice={invoice} company={company} />,
  )

  // `inline` opens it in the browser's viewer, which is also how you print it.
  // `?download=1` forces a save instead.
  const url = new URL(request.url)
  const disposition = url.searchParams.get('download') ? 'attachment' : 'inline'
  const filename = `${invoice.invoiceNumber}.pdf`

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="${filename}"`,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'no-store',
    },
  })
}
