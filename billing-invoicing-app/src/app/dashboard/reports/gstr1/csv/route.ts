import { requireSession } from '@/lib/session'
import { listReturnDocuments } from '@/lib/queries'
import { buildGstr1, gstr1ToCsv } from '@/domain/gst-returns'
import { endOfMonth, startOfMonth, today } from '@/lib/dto'

export const dynamic = 'force-dynamic'

const DATE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: Request) {
  // A route handler is a public endpoint in its own right, whatever proxy.ts
  // does for the pages around it.
  const session = await requireSession()

  const url = new URL(request.url)
  const rawFrom = url.searchParams.get('from') ?? ''
  const rawTo = url.searchParams.get('to') ?? ''

  const from = DATE.test(rawFrom) ? rawFrom : startOfMonth(today())
  const to = DATE.test(rawTo) ? rawTo : endOfMonth(from)

  const documents = await listReturnDocuments(session.entityId, { from, to })
  const csv = gstr1ToCsv(buildGstr1(documents, { from, to }))

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="gstr1-${from}-to-${to}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
