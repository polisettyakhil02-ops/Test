import { formatMinor, type Minor } from '@/domain/money'

/**
 * GSTR-1 extraction.
 *
 * GSTR-1 is filed by section, and which section a document belongs to is
 * decided by the buyer, not by us:
 *
 *   B2B   — the buyer has a GSTIN. Reported invoice by invoice.
 *   B2CL  — unregistered buyer, inter-state, above the 2.5 lakh threshold.
 *           Also invoice by invoice, because the state needs to see it.
 *   B2CS  — everything else to unregistered buyers, reported as a summary
 *           per place of supply and rate rather than per invoice.
 *   CDNR  — credit notes against registered buyers.
 *   HSN   — a summary by HSN/SAC across the whole return.
 *
 * Getting the split wrong is one of the most common reasons a small business's
 * return fails validation, so the rule is implemented once, here, and tested.
 */

/** Invoices to unregistered buyers above this, inter-state, go in B2CL. */
export const B2CL_THRESHOLD_MINOR = 25_000_000 // Rs 2,50,000

export interface ReturnDocument {
  docType: 'invoice' | 'credit_note' | 'payment'
  docNumber: string
  issueDate: string
  status: string
  buyerGstin: string
  buyerName: string
  placeOfSupply: string
  supplyKind: string
  totalMinor: Minor
  reverseCharge?: boolean
  correctsDocNumber?: string | null
  correctsDocDate?: string | null
  lines: Array<{
    description: string
    hsnSac: string
    unit: string
    quantity: string
    taxRatePercent: string
    lineSubtotalMinor: Minor
    lineDiscountMinor: Minor
    lineTaxMinor: Minor
  }>
}

export type Section = 'B2B' | 'B2CL' | 'B2CS' | 'CDNR' | 'EXCLUDED'

/** Which GSTR-1 section a document belongs in. */
export function sectionFor(doc: ReturnDocument): Section {
  // Only posted documents are filed. A voided one never happened for the
  // purposes of the return; a draft was never issued.
  if (doc.status !== 'posted') return 'EXCLUDED'
  if (doc.docType === 'payment') return 'EXCLUDED'

  const registered = doc.buyerGstin.trim().length > 0

  if (doc.docType === 'credit_note') {
    // Credit notes to unregistered buyers are netted off in B2CS rather than
    // reported individually, so only the registered ones are CDNR.
    return registered ? 'CDNR' : 'B2CS'
  }

  if (registered) return 'B2B'

  if (doc.supplyKind === 'inter_state' && doc.totalMinor > B2CL_THRESHOLD_MINOR) {
    return 'B2CL'
  }

  return 'B2CS'
}

export interface RateRow {
  ratePercent: string
  taxableMinor: Minor
  taxMinor: Minor
}

/** Taxable value and tax per rate for one document. */
export function ratesOf(doc: ReturnDocument): RateRow[] {
  const byRate = new Map<string, RateRow>()

  for (const line of doc.lines) {
    const key = line.taxRatePercent
    const row = byRate.get(key) ?? { ratePercent: key, taxableMinor: 0, taxMinor: 0 }
    row.taxableMinor += line.lineSubtotalMinor - line.lineDiscountMinor
    row.taxMinor += line.lineTaxMinor
    byRate.set(key, row)
  }

  return [...byRate.values()].sort((a, b) => Number(a.ratePercent) - Number(b.ratePercent))
}

export interface B2BRow {
  gstin: string
  receiver: string
  invoiceNumber: string
  invoiceDate: string
  invoiceValueMinor: Minor
  placeOfSupply: string
  reverseCharge: 'Y' | 'N'
  invoiceType: 'Regular'
  ratePercent: string
  taxableMinor: Minor
  cessMinor: Minor
}

export interface B2CSRow {
  type: 'OE'
  placeOfSupply: string
  ratePercent: string
  taxableMinor: Minor
  cessMinor: Minor
}

export interface CDNRRow {
  gstin: string
  receiver: string
  noteNumber: string
  noteDate: string
  noteType: 'C'
  originalInvoiceNumber: string
  originalInvoiceDate: string
  placeOfSupply: string
  noteValueMinor: Minor
  ratePercent: string
  taxableMinor: Minor
}

export interface HSNRow {
  hsnSac: string
  description: string
  unit: string
  quantity: number
  taxableMinor: Minor
  taxMinor: Minor
}

export interface Gstr1 {
  from: string
  to: string
  b2b: B2BRow[]
  b2cl: B2BRow[]
  b2cs: B2CSRow[]
  cdnr: CDNRRow[]
  hsn: HSNRow[]
  totals: { taxableMinor: Minor; taxMinor: Minor; documentCount: number }
}

export function buildGstr1(
  documents: ReturnDocument[],
  period: { from: string; to: string },
): Gstr1 {
  const inPeriod = documents.filter(
    (doc) => doc.issueDate >= period.from && doc.issueDate <= period.to,
  )

  const b2b: B2BRow[] = []
  const b2cl: B2BRow[] = []
  const cdnr: CDNRRow[] = []
  const b2csMap = new Map<string, B2CSRow>()
  const hsnMap = new Map<string, HSNRow>()

  let taxableTotal = 0
  let taxTotal = 0
  let counted = 0

  for (const doc of inPeriod) {
    const section = sectionFor(doc)
    if (section === 'EXCLUDED') continue

    counted += 1
    const rates = ratesOf(doc)

    for (const rate of rates) {
      // A credit note reduces the return, so its values are reported negative
      // in the summary sections.
      const sign = doc.docType === 'credit_note' ? -1 : 1
      taxableTotal += sign * rate.taxableMinor
      taxTotal += sign * rate.taxMinor

      if (section === 'B2B' || section === 'B2CL') {
        const row: B2BRow = {
          gstin: doc.buyerGstin,
          receiver: doc.buyerName,
          invoiceNumber: doc.docNumber,
          invoiceDate: doc.issueDate,
          invoiceValueMinor: doc.totalMinor,
          placeOfSupply: doc.placeOfSupply,
          reverseCharge: doc.reverseCharge ? 'Y' : 'N',
          invoiceType: 'Regular',
          ratePercent: rate.ratePercent,
          taxableMinor: rate.taxableMinor,
          cessMinor: 0,
        }
        ;(section === 'B2B' ? b2b : b2cl).push(row)
      } else if (section === 'CDNR') {
        cdnr.push({
          gstin: doc.buyerGstin,
          receiver: doc.buyerName,
          noteNumber: doc.docNumber,
          noteDate: doc.issueDate,
          noteType: 'C',
          originalInvoiceNumber: doc.correctsDocNumber ?? '',
          originalInvoiceDate: doc.correctsDocDate ?? '',
          placeOfSupply: doc.placeOfSupply,
          noteValueMinor: doc.totalMinor,
          ratePercent: rate.ratePercent,
          taxableMinor: rate.taxableMinor,
        })
      } else {
        const key = `${doc.placeOfSupply}|${rate.ratePercent}`
        const existing = b2csMap.get(key) ?? {
          type: 'OE' as const,
          placeOfSupply: doc.placeOfSupply,
          ratePercent: rate.ratePercent,
          taxableMinor: 0,
          cessMinor: 0,
        }
        existing.taxableMinor += sign * rate.taxableMinor
        b2csMap.set(key, existing)
      }
    }

    for (const line of doc.lines) {
      const key = line.hsnSac || '(none)'
      const sign = doc.docType === 'credit_note' ? -1 : 1
      const existing = hsnMap.get(key) ?? {
        hsnSac: key,
        description: line.description,
        unit: line.unit,
        quantity: 0,
        taxableMinor: 0,
        taxMinor: 0,
      }
      existing.quantity += sign * Number(line.quantity)
      existing.taxableMinor += sign * (line.lineSubtotalMinor - line.lineDiscountMinor)
      existing.taxMinor += sign * line.lineTaxMinor
      hsnMap.set(key, existing)
    }
  }

  return {
    from: period.from,
    to: period.to,
    b2b,
    b2cl,
    b2cs: [...b2csMap.values()].sort(
      (a, b) =>
        a.placeOfSupply.localeCompare(b.placeOfSupply) ||
        Number(a.ratePercent) - Number(b.ratePercent),
    ),
    cdnr,
    hsn: [...hsnMap.values()].sort((a, b) => a.hsnSac.localeCompare(b.hsnSac)),
    totals: { taxableMinor: taxableTotal, taxMinor: taxTotal, documentCount: counted },
  }
}

/** Escapes a value for CSV. */
function csvCell(value: string | number): string {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function csvSection(title: string, headers: string[], rows: Array<Array<string | number>>) {
  if (rows.length === 0) return ''
  return [
    title,
    headers.map(csvCell).join(','),
    ...rows.map((row) => row.map(csvCell).join(',')),
    '',
  ].join('\n')
}

/**
 * A single CSV with one block per section.
 *
 * The GST portal's offline utility wants a separate sheet per section; this
 * keeps them in one file with labelled blocks, which is what you actually want
 * when reconciling before you file.
 */
export function gstr1ToCsv(report: Gstr1): string {
  const money = (minor: Minor) => formatMinor(minor)

  return [
    `GSTR-1,${report.from} to ${report.to}`,
    '',
    csvSection(
      'B2B — registered buyers',
      ['GSTIN', 'Receiver', 'Invoice No', 'Invoice Date', 'Invoice Value', 'Place of Supply', 'Reverse Charge', 'Invoice Type', 'Rate', 'Taxable Value', 'Cess'],
      report.b2b.map((r) => [
        r.gstin, r.receiver, r.invoiceNumber, r.invoiceDate, money(r.invoiceValueMinor),
        r.placeOfSupply, r.reverseCharge, r.invoiceType, r.ratePercent, money(r.taxableMinor), money(r.cessMinor),
      ]),
    ),
    csvSection(
      'B2CL — unregistered, inter-state, above 2.5 lakh',
      ['Invoice No', 'Invoice Date', 'Invoice Value', 'Place of Supply', 'Rate', 'Taxable Value', 'Cess'],
      report.b2cl.map((r) => [
        r.invoiceNumber, r.invoiceDate, money(r.invoiceValueMinor), r.placeOfSupply,
        r.ratePercent, money(r.taxableMinor), money(r.cessMinor),
      ]),
    ),
    csvSection(
      'B2CS — unregistered, summarised',
      ['Type', 'Place of Supply', 'Rate', 'Taxable Value', 'Cess'],
      report.b2cs.map((r) => [r.type, r.placeOfSupply, r.ratePercent, money(r.taxableMinor), money(r.cessMinor)]),
    ),
    csvSection(
      'CDNR — credit notes, registered buyers',
      ['GSTIN', 'Receiver', 'Note No', 'Note Date', 'Note Type', 'Original Invoice No', 'Original Invoice Date', 'Place of Supply', 'Note Value', 'Rate', 'Taxable Value'],
      report.cdnr.map((r) => [
        r.gstin, r.receiver, r.noteNumber, r.noteDate, r.noteType,
        r.originalInvoiceNumber, r.originalInvoiceDate, r.placeOfSupply,
        money(r.noteValueMinor), r.ratePercent, money(r.taxableMinor),
      ]),
    ),
    csvSection(
      'HSN summary',
      ['HSN/SAC', 'Description', 'UQC', 'Quantity', 'Taxable Value', 'Tax Amount'],
      report.hsn.map((r) => [r.hsnSac, r.description, r.unit, r.quantity, money(r.taxableMinor), money(r.taxMinor)]),
    ),
  ]
    .filter(Boolean)
    .join('\n')
}
