import { Router } from 'express'
import { getDb } from '@/db'
import { handler, notFound, param } from '@/lib/errors'
import { ageingReport, dashboardTotals, trialBalance } from '@/domain/reports'
import { buildGstr1, gstr1ToCsv } from '@/domain/gst-returns'
import { customerStatement, statementToCsv } from '@/domain/statements'
import { getParty, listReturnDocuments } from '@/lib/queries'
import { endOfMonth, oneYearBefore, startOfMonth, today } from '@/lib/dto'
import { periodSchema } from '@/lib/validation'
import { requireAuth, sessionOf } from '@/middleware/auth'

export const reportRoutes = Router()

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** A period from the query string, with sensible defaults rather than a 400. */
function periodFrom(query: Record<string, unknown>, fallback: { from: string; to: string }) {
  const from = typeof query.from === 'string' && DATE.test(query.from) ? query.from : fallback.from
  const to = typeof query.to === 'string' && DATE.test(query.to) ? query.to : fallback.to
  return periodSchema.parse({ from, to })
}

reportRoutes.get(
  '/reports/dashboard',
  requireAuth,
  handler(async (req, res) => {
    const session = sessionOf(req)
    const store = await getDb()
    const asOf = today()
    const [totals, ageing] = [
      await dashboardTotals(store, session.entityId, asOf),
      await ageingReport(store, session.entityId, asOf),
    ]
    res.json({ asOf, totals, ageing })
  }),
)

reportRoutes.get(
  '/reports/ageing',
  requireAuth,
  handler(async (req, res) => {
    const session = sessionOf(req)
    const store = await getDb()
    const asOf = today()
    res.json({ asOf, rows: await ageingReport(store, session.entityId, asOf) })
  }),
)

reportRoutes.get(
  '/reports/trial-balance',
  requireAuth,
  handler(async (req, res) => {
    const session = sessionOf(req)
    const store = await getDb()
    res.json(await trialBalance(store, session.entityId))
  }),
)

reportRoutes.get(
  '/reports/gstr1',
  requireAuth,
  handler(async (req, res) => {
    const session = sessionOf(req)
    const store = await getDb()
    const period = periodFrom(req.query as Record<string, unknown>, {
      from: startOfMonth(today()),
      to: endOfMonth(today()),
    })
    const documents = await listReturnDocuments(store, session.entityId, period)
    res.json(buildGstr1(documents, period))
  }),
)

reportRoutes.get(
  '/reports/gstr1.csv',
  requireAuth,
  handler(async (req, res) => {
    const session = sessionOf(req)
    const store = await getDb()
    const period = periodFrom(req.query as Record<string, unknown>, {
      from: startOfMonth(today()),
      to: endOfMonth(today()),
    })
    const documents = await listReturnDocuments(store, session.entityId, period)

    res
      .status(200)
      .type('text/csv')
      .set('Content-Disposition', `attachment; filename="gstr1-${period.from}-to-${period.to}.csv"`)
      .set('Cache-Control', 'no-store')
      .send(gstr1ToCsv(buildGstr1(documents, period)))
  }),
)

reportRoutes.get(
  '/clients/:id/statement',
  requireAuth,
  handler(async (req, res) => {
    const session = sessionOf(req)
    const store = await getDb()
    const party = await getParty(store, session.entityId, param(req, 'id'))
    if (!party) throw notFound('That client no longer exists.')

    const to = today()
    const period = periodFrom(req.query as Record<string, unknown>, { from: oneYearBefore(to), to })
    const statement = await customerStatement(store, session.entityId, party.id, period)
    res.json({ party, statement })
  }),
)

reportRoutes.get(
  '/clients/:id/statement.csv',
  requireAuth,
  handler(async (req, res) => {
    const session = sessionOf(req)
    const store = await getDb()
    const party = await getParty(store, session.entityId, param(req, 'id'))
    if (!party) throw notFound('That client no longer exists.')

    const to = today()
    const period = periodFrom(req.query as Record<string, unknown>, { from: oneYearBefore(to), to })
    const statement = await customerStatement(store, session.entityId, party.id, period)
    const slug = party.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

    res
      .status(200)
      .type('text/csv')
      .set('Content-Disposition', `attachment; filename="statement-${slug || 'client'}-${period.to}.csv"`)
      .set('Cache-Control', 'no-store')
      .send(statementToCsv(statement, party.name))
  }),
)
