/**
 * A realistic dataset to look at the app with.
 *
 *   npm run setup -- --email you@company.com --password "..."
 *   npm run entity -- --gstin ... --address "..." --address "City - 560001"
 *   npm run demo
 *
 * Six clients across five states, eight items, and fifteen documents spread
 * over five months, so ageing has real buckets and GSTR-1 has something in
 * every section -- B2B, B2CL, B2CS, CDNR and HSN.
 *
 * Everything goes through the real posting functions, so the ledger is genuine:
 * balanced entries, gapless numbering, real allocations. Nothing is hand-
 * inserted into the journal, which is the point -- demo data that bypassed
 * posting would prove nothing about whether posting works.
 *
 * Not for a database with real books in it. It refuses to run on one unless
 * you pass --force, because there is no undo.
 */
import { config as loadEnv } from 'dotenv'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { documents, entities, items, parties } from '@/db/schema'
import { priceDocument, resolveSupplyKind } from '@/domain/pricing'
import { parseMinor } from '@/domain/money'
import { postInvoice, postPayment, replaceDocumentLines } from '@/domain/posting'

loadEnv({ path: ['.env.local', '.env'], quiet: true })

const ACTOR = { email: 'admin@acme.test' }

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1 })
  const db = drizzle(client, { schema })

  const [org] = await db.select().from(entities).limit(1)
  if (!org) throw new Error('No entity yet. Run `npm run setup` first.')

  // Seeding on top of existing documents would duplicate clients and push the
  // invoice numbering somewhere confusing. Refuse rather than make a mess.
  const existing = await db.select({ id: documents.id }).from(documents).limit(1)
  if (existing.length > 0 && !process.argv.includes('--force')) {
    console.error(
      'This database already has documents in it. Demo data is meant for an empty one.\n' +
        'Re-run with --force if you are sure, or start clean:\n' +
        '  rm -rf .devdb && npm run dev:db   (in another terminal)\n' +
        '  npm run setup -- --email ... --password ...',
    )
    await client.end({ timeout: 5 })
    process.exit(1)
  }

  const CLIENTS = [
    { name: 'Northwind Traders Pvt Ltd', gstin: '29AABCN1234R1ZP', stateCode: '29', email: 'ap@northwind.in', phone: '+91 98450 11223', city: 'Bengaluru', postalCode: '560095', line1: 'Level 7, Embassy Tech Village' },
    { name: 'Globex India Pvt Ltd',      gstin: '27AAACG1234M1Z8', stateCode: '27', email: 'accounts@globex.in', phone: '+91 98200 44556', city: 'Mumbai', postalCode: '400069', line1: 'Plot 12, Andheri East' },
    { name: 'Initech Solutions LLP',     gstin: '33AABCI5678K1Z2', stateCode: '33', email: 'finance@initech.in', phone: '+91 98400 77889', city: 'Chennai', postalCode: '600032', line1: 'Tidel Park, Taramani' },
    { name: 'Umbrella Retail',           gstin: '',                stateCode: '29', email: 'hello@umbrella.in', phone: '+91 99000 12345', city: 'Mysuru', postalCode: '570001', line1: '14 Sayyaji Rao Road' },
    { name: 'Stark Manufacturing Ltd',   gstin: '24AABCS9012Q1Z5', stateCode: '24', email: 'ap@stark.in', phone: '+91 79000 33445', city: 'Ahmedabad', postalCode: '380015', line1: 'Prahladnagar Corporate Road' },
    { name: 'Wayne Enterprises',         gstin: '',                stateCode: '07', email: 'billing@wayne.in', phone: '+91 11000 55667', city: 'New Delhi', postalCode: '110001', line1: 'Connaught Place' },
  ]

  const partyIds: Record<string, string> = {}
  for (const c of CLIENTS) {
    const [row] = await db.insert(parties).values({
      entityId: org.id,
      name: c.name,
      gstin: c.gstin,
      stateCode: c.stateCode,
      email: c.email,
      phone: c.phone,
      billingAddress: { line1: c.line1, line2: '', city: c.city, state: '', postalCode: c.postalCode, country: 'India' },
    }).returning()
    partyIds[c.name] = row.id
  }
  console.log(`clients: ${CLIENTS.length}`)

  const ITEMS = [
    { name: 'Implementation consulting', hsnSac: '998311', unit: 'hour', unitPrice: '4500',   taxRatePercent: '18', description: 'Senior consultant, on-site or remote' },
    { name: 'Managed support (monthly)', hsnSac: '998313', unit: 'month', unitPrice: '35000', taxRatePercent: '18', description: 'Business-hours support retainer' },
    { name: 'Data migration',            hsnSac: '998314', unit: 'job',  unitPrice: '85000',  taxRatePercent: '18', description: 'One-off migration and reconciliation' },
    { name: 'Training workshop',         hsnSac: '999293', unit: 'day',  unitPrice: '28000',  taxRatePercent: '18', description: 'Up to 12 attendees' },
    { name: 'Server appliance',          hsnSac: '84714900', unit: 'unit', unitPrice: '162000', taxRatePercent: '18', description: 'Rack-mounted, 3-year warranty' },
    { name: 'Barcode scanner',           hsnSac: '84716060', unit: 'unit', unitPrice: '7400',  taxRatePercent: '18', description: 'Handheld, USB' },
    { name: 'Annual licence — Standard', hsnSac: '997331', unit: 'licence', unitPrice: '18000', taxRatePercent: '18', description: 'Per seat, per year' },
    { name: 'Printed manual',            hsnSac: '4901',   unit: 'unit', unitPrice: '650',    taxRatePercent: '5',  description: 'Spiral bound' },
  ]

  const itemIds: Record<string, string> = {}
  for (const i of ITEMS) {
    // Mapped column by column rather than spread. `...i` compiled cleanly --
    // excess property checks do not apply through a spread -- and silently
    // inserted nothing for the price and rate, leaving every item at zero.
    const [row] = await db
      .insert(items)
      .values({
        entityId: org.id,
        name: i.name,
        description: i.description,
        hsnSac: i.hsnSac,
        unit: i.unit,
        unitPriceMinor: parseMinor(i.unitPrice),
        defaultTaxRatePercent: i.taxRatePercent,
      })
      .returning()
    itemIds[i.name] = row.id
  }

  const zeroPriced = await db.select().from(items).where(eq(items.unitPriceMinor, 0))
  if (zeroPriced.length > 0) throw new Error(`${zeroPriced.length} items seeded with no price`)

  console.log(`items: ${ITEMS.length}`)

  async function draft(opts: {
    party: string
    issueDate: string
    dueDate: string | null
    docType?: 'invoice' | 'credit_note'
    correctsDocumentId?: string
    notes?: string
    lines: Array<{ item: string; quantity: string }>
    discountValue?: string
  }) {
    const party = (await db.select().from(parties).where(eq(parties.id, partyIds[opts.party])).limit(1))[0]
    const supplyKind = resolveSupplyKind(org.stateCode, party.stateCode)

    const resolved = opts.lines.map((l) => {
      const it = ITEMS.find((x) => x.name === l.item)!
      return { ...it, quantity: l.quantity }
    })

    const priced = priceDocument({
      lines: resolved.map((l) => ({
        description: l.name,
        quantity: l.quantity,
        unitPriceMinor: parseMinor(l.unitPrice),
        taxRatePercent: l.taxRatePercent,
      })),
      discountType: 'fixed',
      discountValue: opts.discountValue ?? '0',
      supplyKind,
    })

    const [doc] = await db.insert(documents).values({
      entityId: org.id,
      docType: opts.docType ?? 'invoice',
      partyId: party.id,
      partySnapshot: {
        name: party.name, email: party.email, phone: party.phone,
        gstin: party.gstin, stateCode: party.stateCode,
        address: [party.billingAddress.line1, party.billingAddress.city, party.billingAddress.postalCode, 'India'].filter(Boolean).join(', '),
      },
      issueDate: opts.issueDate,
      dueDate: opts.dueDate,
      subtotalMinor: priced.subtotalMinor,
      discountMinor: priced.discountMinor,
      taxMinor: priced.taxMinor,
      totalMinor: priced.totalMinor,
      discountType: 'fixed',
      discountValue: opts.discountValue ?? '0',
      supplyKind,
      placeOfSupply: party.stateCode,
      notes: opts.notes ?? '',
      terms: 'Payment due within 30 days. Interest at 1.5% per month on overdue amounts.',
      correctsDocumentId: opts.correctsDocumentId ?? null,
    }).returning()

    await replaceDocumentLines(db, doc.id, resolved.map((l, index) => ({
      lineNo: index + 1,
      itemId: itemIds[l.name],
      description: l.name,
      hsnSac: l.hsnSac,
      unit: l.unit,
      quantity: l.quantity,
      unitPriceMinor: parseMinor(l.unitPrice),
      taxRatePercent: l.taxRatePercent,
      ...priced.lines[index],
    })))

    return doc.id
  }

  const post = (id: string) => db.transaction(async (tx) => postInvoice(tx, id, ACTOR))

  async function pay(party: string, issueDate: string, amount: string, against: string, reference: string) {
    const p = (await db.select().from(parties).where(eq(parties.id, partyIds[party])).limit(1))[0]
    const minor = parseMinor(amount)
    const [doc] = await db.insert(documents).values({
      entityId: org.id,
      docType: 'payment',
      partyId: p.id,
      partySnapshot: { name: p.name, email: p.email, phone: p.phone, gstin: p.gstin, stateCode: p.stateCode, address: '' },
      issueDate,
      subtotalMinor: minor,
      totalMinor: minor,
      notes: reference,
    }).returning()
    await db.transaction(async (tx) =>
      postPayment(tx, doc.id, [{ documentId: against, amountMinor: minor }], ACTOR),
    )
  }

  // ---- the story ---------------------------------------------------------
  // Spread across months so ageing has real buckets, and mixed across states
  // so GSTR-1 has B2B, B2CL, B2CS and CDNR sections with something in them.

  const a = await draft({ party: 'Northwind Traders Pvt Ltd', issueDate: '2026-05-04', dueDate: '2026-06-03',
    lines: [{ item: 'Data migration', quantity: '1' }, { item: 'Implementation consulting', quantity: '24' }] })
  await post(a)
  await pay('Northwind Traders Pvt Ltd', '2026-06-01', '218300', a, 'NEFT ref 8842119')

  const b = await draft({ party: 'Globex India Pvt Ltd', issueDate: '2026-05-19', dueDate: '2026-06-18',
    lines: [{ item: 'Managed support (monthly)', quantity: '3' }] })
  await post(b)
  await pay('Globex India Pvt Ltd', '2026-06-16', '60000', b, 'Part payment, NEFT 9910023')

  const c = await draft({ party: 'Initech Solutions LLP', issueDate: '2026-06-08', dueDate: '2026-07-08',
    lines: [{ item: 'Server appliance', quantity: '2' }, { item: 'Barcode scanner', quantity: '6' }],
    discountValue: '15000', notes: 'Volume discount applied as agreed on the call of 2 June.' })
  await post(c)

  const d = await draft({ party: 'Umbrella Retail', issueDate: '2026-06-22', dueDate: '2026-07-22',
    lines: [{ item: 'Training workshop', quantity: '2' }, { item: 'Printed manual', quantity: '24' }] })
  await post(d)
  await pay('Umbrella Retail', '2026-07-05', '82404', d, 'UPI')

  const e = await draft({ party: 'Stark Manufacturing Ltd', issueDate: '2026-07-02', dueDate: '2026-08-01',
    lines: [{ item: 'Annual licence — Standard', quantity: '40' }] })
  await post(e)

  const f = await draft({ party: 'Wayne Enterprises', issueDate: '2026-07-14', dueDate: '2026-08-13',
    lines: [{ item: 'Server appliance', quantity: '3' }] })
  await post(f)

  const g = await draft({ party: 'Globex India Pvt Ltd', issueDate: '2026-07-27', dueDate: '2026-08-26',
    lines: [{ item: 'Implementation consulting', quantity: '16' }, { item: 'Training workshop', quantity: '1' }] })
  await post(g)

  const h = await draft({ party: 'Northwind Traders Pvt Ltd', issueDate: '2026-08-03', dueDate: '2026-09-02',
    lines: [{ item: 'Managed support (monthly)', quantity: '1' }, { item: 'Barcode scanner', quantity: '4' }] })
  await post(h)

  const i = await draft({ party: 'Initech Solutions LLP', issueDate: '2026-08-11', dueDate: '2026-09-10',
    lines: [{ item: 'Data migration', quantity: '1' }] })
  await post(i)

  // A credit note against the discounted hardware invoice: two scanners returned.
  const note = await draft({
    party: 'Initech Solutions LLP', issueDate: '2026-08-14', dueDate: null,
    docType: 'credit_note', correctsDocumentId: c,
    notes: 'Two scanners returned, DOA. Credit against INV-00003.',
    lines: [{ item: 'Barcode scanner', quantity: '2' }],
  })
  await post(note)

  // A drafted invoice, and a drafted credit note, so the draft state is visible.
  await draft({ party: 'Umbrella Retail', issueDate: '2026-08-16', dueDate: '2026-09-15',
    lines: [{ item: 'Implementation consulting', quantity: '8' }],
    notes: 'Awaiting PO number from the customer before issuing.' })

  await draft({ party: 'Stark Manufacturing Ltd', issueDate: '2026-08-17', dueDate: '2026-09-16',
    lines: [{ item: 'Annual licence — Standard', quantity: '5' }, { item: 'Printed manual', quantity: '10' }] })

  // Register one invoice, so the e-invoicing panel shows the settled state.
  const irn = 'f3a91c07b2e84d5a96c1b8072e4f5d3a17b6c9e0d24f8a35b7c1e69d0af23b845'.slice(0, 64)
  const qr = [
    Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({
      data: JSON.stringify({
        SellerGstin: org.gstin, BuyerGstin: '27AAACG1234M1Z8',
        DocNo: 'INV-00007', DocTyp: 'INV', DocDt: '27/07/2026',
        TotInvVal: '99120.00', ItemCnt: '2', MainHsnCode: '998311', Irn: irn,
      }),
    })).toString('base64url'),
    'ZGVtby1zaWduYXR1cmUtbm90LWEtcmVhbC1JUlAtcmVzcG9uc2U',
  ].join('.')

  await db.update(documents).set({
    irn, ackNo: '112026081700419', ackDate: '2026-07-27 14:06:00', signedQrCode: qr, updatedAt: new Date(),
  }).where(eq(documents.id, g))

  const all = await db.select().from(documents)
  console.log(`documents: ${all.length} (${all.filter((x) => x.status === 'draft').length} draft)`)

  await client.end({ timeout: 5 })
}

main()
