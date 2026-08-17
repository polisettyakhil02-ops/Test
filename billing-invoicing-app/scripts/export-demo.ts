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
import postgres from 'postgres'

loadEnv({ path: ['.env.local', '.env'], quiet: true })

const OUT = process.argv[2] || process.env.EXPORT_TO || '/tmp/demo-data.json'

const iso = (v: unknown) =>
  v instanceof Date ? v.toISOString().slice(0, 10) : v === null ? null : String(v)

const stamp = (v: unknown) => (v instanceof Date ? v.toISOString() : v === null ? null : String(v))

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 })

  const [entity] = await sql`SELECT * FROM entities LIMIT 1`

  const parties = await sql`SELECT * FROM parties ORDER BY name`
  const items = await sql`SELECT * FROM items ORDER BY name`
  const documents = await sql`SELECT * FROM documents ORDER BY issue_date, doc_number`
  const lines = await sql`SELECT * FROM document_lines ORDER BY document_id, line_no`
  const taxes = await sql`SELECT * FROM document_line_taxes`
  const accounts = await sql`SELECT * FROM accounts ORDER BY code`
  const entries = await sql`SELECT * FROM journal_entries ORDER BY entry_date, posted_at`
  const jlines = await sql`SELECT * FROM journal_lines ORDER BY entry_id, line_no`
  const allocations = await sql`SELECT * FROM allocations`
  const outbox = await sql`SELECT * FROM outbox ORDER BY created_at DESC`

  const data = {
    entity: {
      name: entity.name,
      legalName: entity.legal_name,
      gstin: entity.gstin,
      stateCode: entity.state_code,
      addressLines: entity.address_lines,
      email: entity.email,
      phone: entity.phone,
      bankDetails: entity.bank_details,
    },
    parties: parties.map((p) => ({
      id: p.id, name: p.name, email: p.email, phone: p.phone, gstin: p.gstin,
      stateCode: p.state_code, billingAddress: p.billing_address, notes: p.notes,
    })),
    items: items.map((i) => ({
      id: i.id, name: i.name, description: i.description, hsnSac: i.hsn_sac,
      unit: i.unit, unitPriceMinor: Number(i.unit_price_minor),
      taxRatePercent: i.default_tax_rate_percent,
    })),
    documents: documents.map((d) => ({
      id: d.id, docType: d.doc_type, docNumber: d.doc_number, status: d.status,
      partyId: d.party_id, partySnapshot: d.party_snapshot,
      issueDate: iso(d.issue_date), dueDate: iso(d.due_date),
      subtotalMinor: Number(d.subtotal_minor), discountMinor: Number(d.discount_minor),
      taxMinor: Number(d.tax_minor), totalMinor: Number(d.total_minor),
      supplyKind: d.supply_kind, placeOfSupply: d.place_of_supply,
      notes: d.notes, terms: d.terms, correctsDocumentId: d.corrects_document_id,
      irn: d.irn, ackNo: d.ack_no, ackDate: d.ack_date, signedQrCode: d.signed_qr_code,
      postedAt: stamp(d.posted_at),
    })),
    lines: lines.map((l) => ({
      id: l.id, documentId: l.document_id, lineNo: l.line_no, description: l.description,
      hsnSac: l.hsn_sac, unit: l.unit, quantity: l.quantity,
      unitPriceMinor: Number(l.unit_price_minor), taxRatePercent: l.tax_rate_percent,
      lineSubtotalMinor: Number(l.line_subtotal_minor),
      lineDiscountMinor: Number(l.line_discount_minor),
      lineTaxMinor: Number(l.line_tax_minor), lineTotalMinor: Number(l.line_total_minor),
    })),
    taxes: taxes.map((t) => ({
      documentLineId: t.document_line_id, component: t.component,
      ratePercent: t.rate_percent, taxableMinor: Number(t.taxable_minor),
      amountMinor: Number(t.amount_minor),
    })),
    accounts: accounts.map((a) => ({ id: a.id, code: a.code, name: a.name, type: a.type })),
    entries: entries.map((e) => ({
      id: e.id, entryDate: iso(e.entry_date), memo: e.memo,
      sourceType: e.source_type, sourceId: e.source_id, postedAt: stamp(e.posted_at),
    })),
    journalLines: jlines.map((l) => ({
      entryId: l.entry_id, lineNo: l.line_no, accountId: l.account_id, partyId: l.party_id,
      debitMinor: Number(l.debit_minor), creditMinor: Number(l.credit_minor), memo: l.memo,
    })),
    allocations: allocations.map((a) => ({
      fromDocumentId: a.from_document_id, toDocumentId: a.to_document_id,
      amountMinor: Number(a.amount_minor),
    })),
    outbox: outbox.map((o) => ({
      id: o.id, topic: o.topic, payload: o.payload, createdAt: stamp(o.created_at),
      deliveredAt: stamp(o.delivered_at), attempts: o.attempts, lastError: o.last_error,
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

  await sql.end({ timeout: 5 })
}

main()
