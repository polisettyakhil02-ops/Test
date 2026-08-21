/**
 * Dumps the database to JSON.
 *
 *   npm run export -- /tmp/demo-data.json
 *
 * Exports the *source* records -- documents, lines, journal entries, accounts,
 * allocations -- rather than pre-computed report output, so whatever consumes
 * it can re-derive its figures the way the app does.
 */
import { config as loadEnv } from 'dotenv'
import { writeFileSync } from 'node:fs'
import { MongoClient } from 'mongodb'
import { makeStore } from '@/db/collections'

loadEnv({ path: ['.env.local', '.env'], quiet: true })

const OUT = process.argv[2] || process.env.EXPORT_TO || '/tmp/demo-data.json'

const stamp = (v: Date | null) => (v ? v.toISOString() : null)

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('Missing MONGODB_URI.')

  const client = new MongoClient(uri)
  await client.connect()
  const store = makeStore(client.db(), client)

  const entity = await store.entities.findOne({})
  const parties = await store.parties.find({}).sort({ name: 1 }).toArray()
  const items = await store.items.find({}).sort({ name: 1 }).toArray()
  const documents = await store.documents.find({}).sort({ issueDate: 1, docNumber: 1 }).toArray()
  const accounts = await store.accounts.find({}).sort({ code: 1 }).toArray()
  const entries = await store.journalEntries.find({}).sort({ entryDate: 1, postedAt: 1 }).toArray()
  const allocations = await store.allocations.find({}).toArray()
  const outbox = await store.outbox.find({}).sort({ createdAt: -1 }).toArray()

  // Lines and taxes are embedded on each document in this database, but the
  // export keeps the same flat shape the Postgres version produced -- one
  // array of lines, one of tax rows, each carrying the id of the document (or
  // line) it belongs to -- so anything already written against that shape
  // keeps working.
  const lines = documents.flatMap((d) => d.lines.map((l) => ({ ...l, documentId: d._id })))
  const taxes = lines.flatMap((l) => l.taxes.map((t) => ({ ...t, documentLineId: l._id })))
  const journalLines = entries.flatMap((e) => e.lines.map((jl) => ({ ...jl, entryId: e._id })))

  const data = {
    entity: entity && {
      name: entity.name,
      legalName: entity.legalName,
      gstin: entity.gstin,
      stateCode: entity.stateCode,
      addressLines: entity.addressLines,
      email: entity.email,
      phone: entity.phone,
      bankDetails: entity.bankDetails,
    },
    parties: parties.map((p) => ({
      id: p._id, name: p.name, email: p.email, phone: p.phone, gstin: p.gstin,
      stateCode: p.stateCode, billingAddress: p.billingAddress, notes: p.notes,
    })),
    items: items.map((i) => ({
      id: i._id, name: i.name, description: i.description, hsnSac: i.hsnSac,
      unit: i.unit, unitPriceMinor: i.unitPriceMinor,
      taxRatePercent: i.defaultTaxRatePercent,
    })),
    documents: documents.map((d) => ({
      id: d._id, docType: d.docType, docNumber: d.docNumber, status: d.status,
      partyId: d.partyId, partySnapshot: d.partySnapshot,
      issueDate: d.issueDate, dueDate: d.dueDate,
      subtotalMinor: d.subtotalMinor, discountMinor: d.discountMinor,
      taxMinor: d.taxMinor, totalMinor: d.totalMinor, allocatedMinor: d.allocatedMinor,
      supplyKind: d.supplyKind, placeOfSupply: d.placeOfSupply,
      notes: d.notes, terms: d.terms, correctsDocumentId: d.correctsDocumentId,
      irn: d.irn, ackNo: d.ackNo, ackDate: d.ackDate, signedQrCode: d.signedQrCode,
      postedAt: stamp(d.postedAt),
    })),
    lines: lines.map((l) => ({
      id: l._id, documentId: l.documentId, lineNo: l.lineNo, description: l.description,
      hsnSac: l.hsnSac, unit: l.unit, quantity: l.quantity,
      unitPriceMinor: l.unitPriceMinor, taxRatePercent: l.taxRatePercent,
      lineSubtotalMinor: l.lineSubtotalMinor,
      lineDiscountMinor: l.lineDiscountMinor,
      lineTaxMinor: l.lineTaxMinor, lineTotalMinor: l.lineTotalMinor,
    })),
    taxes: taxes.map((t) => ({
      documentLineId: t.documentLineId, component: t.component,
      ratePercent: t.ratePercent, taxableMinor: t.taxableMinor,
      amountMinor: t.amountMinor,
    })),
    accounts: accounts.map((a) => ({ id: a._id, code: a.code, name: a.name, type: a.type })),
    entries: entries.map((e) => ({
      id: e._id, entryDate: e.entryDate, memo: e.memo,
      sourceType: e.sourceType, sourceId: e.sourceId, postedAt: stamp(e.postedAt),
    })),
    journalLines: journalLines.map((l) => ({
      entryId: l.entryId, lineNo: l.lineNo, accountId: l.accountId, partyId: l.partyId,
      debitMinor: l.debitMinor, creditMinor: l.creditMinor, memo: l.memo,
    })),
    allocations: allocations.map((a) => ({
      fromDocumentId: a.fromDocumentId, toDocumentId: a.toDocumentId,
      amountMinor: a.amountMinor,
    })),
    outbox: outbox.map((o) => ({
      id: o._id, topic: o.topic, payload: o.payload, createdAt: stamp(o.createdAt),
      deliveredAt: stamp(o.deliveredAt), attempts: o.attempts, lastError: o.lastError,
    })),
  }

  writeFileSync(OUT, JSON.stringify(data))
  const kb = (JSON.stringify(data).length / 1024).toFixed(0)
  console.log(`${OUT} — ${kb} KB`)
  console.log(
    `parties ${data.parties.length} · items ${data.items.length} · documents ${data.documents.length} · ` +
      `lines ${data.lines.length} · entries ${data.entries.length} · journal lines ${data.journalLines.length} · ` +
      `allocations ${data.allocations.length} · outbox ${data.outbox.length}`,
  )

  await client.close()
}

main()
