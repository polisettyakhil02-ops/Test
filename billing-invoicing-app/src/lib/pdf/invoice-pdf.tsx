import React from 'react'
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { taxSummary, type PricedLine } from '@/domain/pricing'
import { formatMoneyPlain, formatDate } from '@/lib/dto'

export interface PdfCompany {
  name: string
  addressLines: string[]
  gstin: string
  email: string
  phone: string
  bankDetails: string
  footerNote: string
}

export interface PdfDocument {
  docType: string
  docNumber: string | null
  status: string
  partySnapshot: { name: string; email: string; phone: string; gstin: string; address: string }
  issueDate: string
  dueDate: string | null
  subtotalMinor: number
  discountMinor: number
  totalMinor: number
  allocatedMinor: number
  discountType: string
  discountValue: string
  supplyKind: string
  notes: string
  terms: string
  irn: string | null
  ackNo: string | null
  ackDate: string | null
  /** A PNG data URI of the signed QR string, or null when unregistered. */
  qrDataUrl: string | null
  lines: Array<{
    id: string
    description: string
    hsnSac: string
    unit: string
    quantity: string
    unitPriceMinor: number
    taxRatePercent: string
    lineSubtotalMinor: number
    lineDiscountMinor: number
    lineTaxMinor: number
    lineTotalMinor: number
  }>
}

// Helvetica is one of the PDF base-14 fonts, so nothing has to be embedded or
// downloaded at render time. See formatCurrencyPlain() for the encoding caveat
// that comes with it.
const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 40,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: '#111827',
    // Deliberately no page-level lineHeight: it is inherited by the absolutely
    // positioned footer and inflates its computed height enough that the footer
    // silently never renders. Line spacing is set per text block instead.
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  companyName: { fontSize: 15, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  muted: { color: '#6b7280' },
  headerRight: { alignItems: 'flex-end', maxWidth: 220 },
  docTitle: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1,
    marginBottom: 6,
  },
  metaRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  metaLabel: { color: '#6b7280' },
  metaValue: { fontFamily: 'Helvetica-Bold' },

  parties: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 22 },
  partyBlock: { width: '48%' },
  sectionLabel: {
    fontSize: 7.5,
    letterSpacing: 1,
    color: '#6b7280',
    marginBottom: 5,
    fontFamily: 'Helvetica-Bold',
  },
  partyName: { fontFamily: 'Helvetica-Bold', marginBottom: 2 },

  table: { marginBottom: 14 },
  tableHead: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#111827',
    paddingBottom: 5,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e5e7eb',
  },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 8 },
  colIndex: { width: '4%' },
  colDesc: { width: '34%', paddingRight: 6 },
  colHsn: { width: '12%' },
  colQty: { width: '12%', textAlign: 'right' },
  colRate: { width: '14%', textAlign: 'right' },
  colTax: { width: '8%', textAlign: 'right' },
  colAmount: { width: '16%', textAlign: 'right' },

  totalsWrap: { flexDirection: 'row', justifyContent: 'flex-end' },
  totals: { width: '52%' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2.5 },
  grandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#111827',
    marginTop: 5,
    paddingTop: 6,
  },
  grandText: { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 5,
    borderTopWidth: 0.5,
    borderTopColor: '#e5e7eb',
  },
  bold: { fontFamily: 'Helvetica-Bold' },

  notesWrap: { flexDirection: 'row', gap: 24, marginTop: 26 },
  notesBlock: { width: '48%' },
  // Only for genuine multi-line paragraphs, where line spacing actually
  // applies to wrapped lines rather than inflating a single-line block.
  bodyText: { lineHeight: 1.4 },
  bankBlock: { marginTop: 18 },

  irnBlock: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
    padding: 10,
    borderWidth: 0.5,
    borderColor: '#e5e7eb',
    borderRadius: 3,
  },
  irnQr: { width: 78, height: 78 },
  irnFields: { flexGrow: 1, justifyContent: 'center' },
  irnValue: { fontFamily: 'Helvetica-Bold', fontSize: 7.5 },

  footer: {
    position: 'absolute',
    bottom: 28,
    left: 40,
    right: 40,
    borderTopWidth: 0.5,
    borderTopColor: '#e5e7eb',
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7.5,
    color: '#6b7280',
  },
})

interface InvoicePdfProps {
  invoice: PdfDocument
  company: PdfCompany
}

export function InvoicePdf({ invoice, company }: InvoicePdfProps) {
  const breakdown = taxSummary(
    invoice.lines.map(
      (line): PricedLine => ({
        lineSubtotalMinor: line.lineSubtotalMinor,
        lineDiscountMinor: line.lineDiscountMinor,
        lineTaxMinor: line.lineTaxMinor,
        lineTotalMinor: line.lineTotalMinor,
        taxes:
          line.lineTaxMinor > 0
            ? invoice.supplyKind === 'inter_state'
              ? [
                  {
                    component: 'IGST' as const,
                    ratePercent: line.taxRatePercent,
                    taxableMinor: line.lineSubtotalMinor - line.lineDiscountMinor,
                    amountMinor: line.lineTaxMinor,
                  },
                ]
              : [
                  {
                    component: 'CGST' as const,
                    ratePercent: String(Number(line.taxRatePercent) / 2),
                    taxableMinor: line.lineSubtotalMinor - line.lineDiscountMinor,
                    amountMinor: Math.floor(line.lineTaxMinor / 2),
                  },
                  {
                    component: 'SGST' as const,
                    ratePercent: String(Number(line.taxRatePercent) / 2),
                    taxableMinor: line.lineSubtotalMinor - line.lineDiscountMinor,
                    amountMinor: line.lineTaxMinor - Math.floor(line.lineTaxMinor / 2),
                  },
                ]
            : [],
      }),
    ),
  )
  const isCancelled = invoice.status === 'voided'
  const isCredit = invoice.docType === 'credit_note'
  const amountDueMinor = invoice.totalMinor - invoice.allocatedMinor

  return (
    <Document
      title={`${invoice.docNumber ?? 'Draft'} — ${invoice.partySnapshot.name}`}
      author={company.name}
      subject={`${invoice.docType} ${invoice.docNumber ?? ''}`}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <View style={{ maxWidth: 260 }}>
            <Text style={styles.companyName}>{company.name}</Text>
            {company.addressLines.map((line, index) => (
              <Text key={index} style={styles.muted}>
                {line}
              </Text>
            ))}
            {company.gstin ? <Text style={styles.muted}>GSTIN {company.gstin}</Text> : null}
            {company.email ? <Text style={styles.muted}>{company.email}</Text> : null}
            {company.phone ? <Text style={styles.muted}>{company.phone}</Text> : null}
          </View>

          <View style={styles.headerRight}>
            <Text style={styles.docTitle}>
              {isCancelled ? 'VOIDED' : isCredit ? 'CREDIT NOTE' : 'TAX INVOICE'}
            </Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Invoice no.</Text>
              <Text style={styles.metaValue}>{invoice.docNumber ?? 'DRAFT'}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Issue date</Text>
              <Text style={styles.metaValue}>{formatDate(invoice.issueDate)}</Text>
            </View>
            {invoice.dueDate ? (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Due date</Text>
                <Text style={styles.metaValue}>{formatDate(invoice.dueDate)}</Text>
              </View>
            ) : null}
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Place of supply</Text>
              <Text style={styles.metaValue}>
                {invoice.supplyKind === 'inter_state' ? 'Inter-state' : 'Intra-state'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.parties}>
          <View style={styles.partyBlock}>
            <Text style={styles.sectionLabel}>BILL TO</Text>
            <Text style={styles.partyName}>{invoice.partySnapshot.name || '-'}</Text>
            {invoice.partySnapshot.address ? (
              <Text style={styles.muted}>{invoice.partySnapshot.address}</Text>
            ) : null}
            {invoice.partySnapshot.gstin ? (
              <Text style={styles.muted}>GSTIN {invoice.partySnapshot.gstin}</Text>
            ) : null}
            {invoice.partySnapshot.email ? (
              <Text style={styles.muted}>{invoice.partySnapshot.email}</Text>
            ) : null}
            {invoice.partySnapshot.phone ? (
              <Text style={styles.muted}>{invoice.partySnapshot.phone}</Text>
            ) : null}
          </View>

          <View style={[styles.partyBlock, { alignItems: 'flex-end' }]}>
            <Text style={styles.sectionLabel}>AMOUNT DUE</Text>
            <Text style={{ fontSize: 16, fontFamily: 'Helvetica-Bold' }}>
              {formatMoneyPlain(amountDueMinor)}
            </Text>
          </View>
        </View>

        {/* Under the e-invoicing mandate a registered invoice must carry the
            signed QR the IRP returned; without it the printed copy is not a
            valid tax invoice. */}
        {invoice.irn ? (
          <View style={styles.irnBlock} wrap={false}>
            {invoice.qrDataUrl ? (
              // react-pdf's <Image>, not an HTML one -- a PDF image has no alt
              // attribute for the a11y rule to check.
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={invoice.qrDataUrl} style={styles.irnQr} />
            ) : null}
            <View style={styles.irnFields}>
              <Text style={styles.sectionLabel}>e-INVOICE</Text>
              <Text style={styles.muted}>IRN</Text>
              <Text style={styles.irnValue}>{invoice.irn}</Text>
              <Text style={[styles.muted, { marginTop: 4 }]}>
                Ack. {invoice.ackNo ?? '-'} · {invoice.ackDate ?? '-'}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.table}>
          {/* `fixed` repeats the header if the table spills onto a second page. */}
          <View style={styles.tableHead} fixed>
            <Text style={[styles.th, styles.colIndex]}>#</Text>
            <Text style={[styles.th, styles.colDesc]}>Description</Text>
            <Text style={[styles.th, styles.colHsn]}>HSN/SAC</Text>
            <Text style={[styles.th, styles.colQty]}>Qty</Text>
            <Text style={[styles.th, styles.colRate]}>Rate</Text>
            <Text style={[styles.th, styles.colTax]}>Tax</Text>
            <Text style={[styles.th, styles.colAmount]}>Amount</Text>
          </View>

          {invoice.lines.map((line, index) => (
            <View key={line.id} style={styles.tableRow} wrap={false}>
              <Text style={styles.colIndex}>{index + 1}</Text>
              <Text style={styles.colDesc}>{line.description}</Text>
              <Text style={styles.colHsn}>{line.hsnSac || '-'}</Text>
              <Text style={styles.colQty}>
                {line.quantity} {line.unit}
              </Text>
              <Text style={styles.colRate}>{formatMoneyPlain(line.unitPriceMinor)}</Text>
              <Text style={styles.colTax}>{line.taxRatePercent}%</Text>
              <Text style={styles.colAmount}>{formatMoneyPlain(line.lineTotalMinor)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsWrap} wrap={false}>
          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text style={styles.muted}>Subtotal</Text>
              <Text>{formatMoneyPlain(invoice.subtotalMinor)}</Text>
            </View>

            {invoice.discountMinor > 0 ? (
              <View style={styles.totalRow}>
                <Text style={styles.muted}>
                  Discount
                  {invoice.discountType === 'percentage'
                    ? ` (${invoice.discountValue}%)`
                    : ''}
                </Text>
                <Text>-{formatMoneyPlain(invoice.discountMinor)}</Text>
              </View>
            ) : null}

            {breakdown
              .filter((row) => Number(row.ratePercent) > 0)
              .map((row) => (
                <View key={`${row.component}${row.ratePercent}`} style={styles.totalRow}>
                  <Text style={styles.muted}>
                    {row.component} @ {row.ratePercent}% on {formatMoneyPlain(row.taxableMinor)}
                  </Text>
                  <Text>{formatMoneyPlain(row.amountMinor)}</Text>
                </View>
              ))}

            <View style={styles.grandRow}>
              <Text style={styles.grandText}>Total</Text>
              <Text style={styles.grandText}>{formatMoneyPlain(invoice.totalMinor)}</Text>
            </View>

            <View style={styles.totalRow}>
              <Text style={styles.muted}>Settled</Text>
              <Text>{formatMoneyPlain(invoice.allocatedMinor)}</Text>
            </View>

            <View style={styles.balanceRow}>
              <Text style={styles.bold}>Balance due</Text>
              <Text style={styles.bold}>{formatMoneyPlain(amountDueMinor)}</Text>
            </View>
          </View>
        </View>

        {invoice.notes || invoice.terms ? (
          <View style={styles.notesWrap} wrap={false}>
            {invoice.notes ? (
              <View style={styles.notesBlock}>
                <Text style={styles.sectionLabel}>NOTES</Text>
                <Text style={styles.bodyText}>{invoice.notes}</Text>
              </View>
            ) : null}
            {invoice.terms ? (
              <View style={styles.notesBlock}>
                <Text style={styles.sectionLabel}>TERMS</Text>
                <Text style={styles.bodyText}>{invoice.terms}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {company.bankDetails ? (
          <View style={styles.bankBlock} wrap={false}>
            <Text style={styles.sectionLabel}>PAYMENT DETAILS</Text>
            <Text style={styles.bodyText}>{company.bankDetails}</Text>
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text>{company.footerNote}</Text>
          <Text
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  )
}
