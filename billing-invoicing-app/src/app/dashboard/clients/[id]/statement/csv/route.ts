import { db } from '@/db'
import { requireSession } from '@/lib/session'
import { getParty } from '@/lib/queries'
import { customerStatement, statementToCsv } from '@/domain/statements'
import { oneYearBefore, today } from '@/lib/dto'

export const dynamic = 'force-dynamic'

const DATE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(
  request: Request,
  context: RouteContext<'/dashboard/clients/[id]/statement/csv'>,
) {
  const session = await requireSession()
  const { id } = await context.params

  const party = await getParty(session.entityId, id)
  if (!party) return new Response('Not found', { status: 404 })

  const url = new URL(request.url)
  const rawFrom = url.searchParams.get('from') ?? ''
  const rawTo = url.searchParams.get('to') ?? ''

  const to = DATE.test(rawTo) ? rawTo : today()
  const from = DATE.test(rawFrom) ? rawFrom : oneYearBefore(to)

  const statement = await customerStatement(db, session.entityId, id, { from, to })
  const csv = statementToCsv(statement, party.name)

  const slug = party.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="statement-${slug || 'client'}-${to}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
