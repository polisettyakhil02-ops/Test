import { Router } from 'express'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { entities, items, parties } from '@/db/schema'
import { handler, notFound, param } from '@/lib/errors'
import { parseMinor } from '@/domain/money'
import { allItems, allParties, getItem, getParty, listItems, listParties } from '@/lib/queries'
import { itemSchema, partySchema } from '@/lib/validation'
import { requireAuth, requireRole, sessionOf } from '@/middleware/auth'

export const masterRoutes = Router()

const page = (value: unknown) => {
  const n = Number(value)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
}

/* ------------------------------------------------------------------ entity */

masterRoutes.get(
  '/entity',
  requireAuth,
  handler(async (req, res) => {
    const session = sessionOf(req)
    const [entity] = await db.select().from(entities).where(eq(entities.id, session.entityId)).limit(1)
    if (!entity) throw notFound('No entity configured.')
    res.json({ entity })
  }),
)

/* ----------------------------------------------------------------- clients */

masterRoutes.get(
  '/clients',
  requireAuth,
  handler(async (req, res) => {
    const session = sessionOf(req)
    if (req.query.all === 'true') {
      res.json({ rows: await allParties(session.entityId) })
      return
    }
    res.json(
      await listParties(session.entityId, {
        query: typeof req.query.q === 'string' ? req.query.q : '',
        page: page(req.query.page),
      }),
    )
  }),
)

masterRoutes.get(
  '/clients/:id',
  requireAuth,
  handler(async (req, res) => {
    const session = sessionOf(req)
    const party = await getParty(session.entityId, param(req, 'id'))
    if (!party) throw notFound('That client no longer exists.')
    res.json({ party })
  }),
)

masterRoutes.post(
  '/clients',
  requireRole('accountant'),
  handler(async (req, res) => {
    const session = sessionOf(req)
    const input = partySchema.parse(req.body)
    const [party] = await db
      .insert(parties)
      .values({ entityId: session.entityId, ...input })
      .returning()
    res.status(201).json({ party })
  }),
)

masterRoutes.patch(
  '/clients/:id',
  requireRole('accountant'),
  handler(async (req, res) => {
    const session = sessionOf(req)
    const existing = await getParty(session.entityId, param(req, 'id'))
    if (!existing) throw notFound('That client no longer exists.')

    const input = partySchema.parse(req.body)
    const [party] = await db
      .update(parties)
      .set(input)
      .where(and(eq(parties.entityId, session.entityId), eq(parties.id, param(req, 'id'))))
      .returning()
    res.json({ party })
  }),
)

masterRoutes.delete(
  '/clients/:id',
  requireRole('admin'),
  handler(async (req, res) => {
    const session = sessionOf(req)
    // A client with documents is refused by a foreign key, which the error
    // middleware turns into a 409 with the database's own message.
    await db
      .delete(parties)
      .where(and(eq(parties.entityId, session.entityId), eq(parties.id, param(req, 'id'))))
    res.json({ ok: true })
  }),
)

/* ------------------------------------------------------------------- items */

masterRoutes.get(
  '/items',
  requireAuth,
  handler(async (req, res) => {
    const session = sessionOf(req)
    if (req.query.all === 'true') {
      res.json({ rows: await allItems(session.entityId) })
      return
    }
    res.json(
      await listItems(session.entityId, {
        query: typeof req.query.q === 'string' ? req.query.q : '',
        page: page(req.query.page),
      }),
    )
  }),
)

masterRoutes.get(
  '/items/:id',
  requireAuth,
  handler(async (req, res) => {
    const session = sessionOf(req)
    const item = await getItem(session.entityId, param(req, 'id'))
    if (!item) throw notFound('That item no longer exists.')
    res.json({ item })
  }),
)

/** Prices arrive as decimal strings and are stored as integer paise. */
function itemRow(input: ReturnType<typeof itemSchema.parse>) {
  return {
    name: input.name,
    description: input.description,
    hsnSac: input.hsnSac,
    unit: input.unit,
    unitPriceMinor: parseMinor(input.unitPrice),
    defaultTaxRatePercent: input.taxRatePercent,
  }
}

masterRoutes.post(
  '/items',
  requireRole('accountant'),
  handler(async (req, res) => {
    const session = sessionOf(req)
    const input = itemSchema.parse(req.body)
    const [item] = await db
      .insert(items)
      .values({ entityId: session.entityId, ...itemRow(input) })
      .returning()
    res.status(201).json({ item })
  }),
)

masterRoutes.patch(
  '/items/:id',
  requireRole('accountant'),
  handler(async (req, res) => {
    const session = sessionOf(req)
    const existing = await getItem(session.entityId, param(req, 'id'))
    if (!existing) throw notFound('That item no longer exists.')

    const input = itemSchema.parse(req.body)
    const [item] = await db
      .update(items)
      .set(itemRow(input))
      .where(and(eq(items.entityId, session.entityId), eq(items.id, param(req, 'id'))))
      .returning()
    res.json({ item })
  }),
)

masterRoutes.delete(
  '/items/:id',
  requireRole('admin'),
  handler(async (req, res) => {
    const session = sessionOf(req)
    await db
      .delete(items)
      .where(and(eq(items.entityId, session.entityId), eq(items.id, param(req, 'id'))))
    res.json({ ok: true })
  }),
)
