import { Router } from 'express'
import { getDb } from '@/db'
import { badRequest, handler, notFound, param } from '@/lib/errors'
import { parseMinor } from '@/domain/money'
import {
  allItems,
  allParties,
  deleteItem,
  deleteParty,
  getItem,
  getParty,
  insertItem,
  insertParty,
  listItems,
  listParties,
  updateItem,
  updateParty,
} from '@/lib/queries'
import { withId } from '@/lib/serialize'
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
    const store = await getDb()
    const entity = await store.entities.findOne({ _id: session.entityId })
    if (!entity) throw notFound('No entity configured.')
    res.json({ entity: withId(entity) })
  }),
)

/* ----------------------------------------------------------------- clients */

masterRoutes.get(
  '/clients',
  requireAuth,
  handler(async (req, res) => {
    const session = sessionOf(req)
    const store = await getDb()
    if (req.query.all === 'true') {
      res.json({ rows: await allParties(store, session.entityId) })
      return
    }
    res.json(
      await listParties(store, session.entityId, {
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
    const store = await getDb()
    const party = await getParty(store, session.entityId, param(req, 'id'))
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
    const store = await getDb()
    const party = await insertParty(store, session.entityId, input)
    res.status(201).json({ party })
  }),
)

masterRoutes.patch(
  '/clients/:id',
  requireRole('accountant'),
  handler(async (req, res) => {
    const session = sessionOf(req)
    const store = await getDb()
    const existing = await getParty(store, session.entityId, param(req, 'id'))
    if (!existing) throw notFound('That client no longer exists.')

    const input = partySchema.parse(req.body)
    const party = await updateParty(store, session.entityId, param(req, 'id'), input)
    res.json({ party })
  }),
)

masterRoutes.delete(
  '/clients/:id',
  requireRole('admin'),
  handler(async (req, res) => {
    const session = sessionOf(req)
    const store = await getDb()

    // MongoDB has no foreign key to refuse this on its own, so the check that
    // a client with documents cannot be deleted is made here, explicitly,
    // rather than relying on a constraint the database does not have.
    const hasDocuments = await store.documents.findOne(
      { entityId: session.entityId, partyId: param(req, 'id') },
      { projection: { _id: 1 } },
    )
    if (hasDocuments) {
      throw badRequest('This client has documents on file and cannot be deleted.')
    }

    await deleteParty(store, session.entityId, param(req, 'id'))
    res.json({ ok: true })
  }),
)

/* ------------------------------------------------------------------- items */

masterRoutes.get(
  '/items',
  requireAuth,
  handler(async (req, res) => {
    const session = sessionOf(req)
    const store = await getDb()
    if (req.query.all === 'true') {
      res.json({ rows: await allItems(store, session.entityId) })
      return
    }
    res.json(
      await listItems(store, session.entityId, {
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
    const store = await getDb()
    const item = await getItem(store, session.entityId, param(req, 'id'))
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
    const store = await getDb()
    const item = await insertItem(store, session.entityId, itemRow(input))
    res.status(201).json({ item })
  }),
)

masterRoutes.patch(
  '/items/:id',
  requireRole('accountant'),
  handler(async (req, res) => {
    const session = sessionOf(req)
    const store = await getDb()
    const existing = await getItem(store, session.entityId, param(req, 'id'))
    if (!existing) throw notFound('That item no longer exists.')

    const input = itemSchema.parse(req.body)
    const item = await updateItem(store, session.entityId, param(req, 'id'), itemRow(input))
    res.json({ item })
  }),
)

masterRoutes.delete(
  '/items/:id',
  requireRole('admin'),
  handler(async (req, res) => {
    const session = sessionOf(req)
    const store = await getDb()
    await deleteItem(store, session.entityId, param(req, 'id'))
    res.json({ ok: true })
  }),
)
