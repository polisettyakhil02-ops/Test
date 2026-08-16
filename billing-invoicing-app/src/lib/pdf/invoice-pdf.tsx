import React from 'react'
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { taxBreakdown } from '@/lib/invoice-math'
import { formatCurrencyPlain, formatDate, INVOICE_STATUS_LABELS } from '@/lib/dto'
import type { InvoiceDTO } from '@/lib/dto'
import type { CompanyDetails } from '@/lib/company'

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
  invoice: InvoiceDTO
  company: CompanyDetails
}

export function InvoicePdf({ invoice, company }: InvoicePdfProps) {
  const breakdown = taxBreakdown(invoice.lineItems)
  const isCancelled = invoice.status === 'cancelled'

  return (
    <Document
      title={`${invoice.invoiceNumber} — ${invoice.clientSnapshot.name}`}
      author={company.name}
      subject={`Invoice ${invoice.invoiceNumber}`}
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
              {isCancelled ? 'CANCELLED INVOICE' : 'TAX INVOICE'}
            </Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Invoice no.</Text>
              <Text style={styles.metaValue}>{invoice.invoiceNumber}</Text>
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
              <Text style={styles.metaLabel}>Status</Text>
              <Text style={styles.metaValue}>
                {INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.parties}>
          <View style={styles.partyBlock}>
            <Text style={styles.sectionLabel}>BILL TO</Text>
            <Text style={styles.partyName}>{invoice.clientSnapshot.name || '-'}</Text>
            {invoice.clientSnapshot.address ? (
              <Text style={styles.muted}>{invoice.clientSnapshot.address}</Text>
            ) : null}
            {invoice.clientSnapshot.gstin ? (
              <Text style={styles.muted}>GSTIN {invoice.clientSnapshot.gstin}</Text>
            ) : null}
            {invoice.clientSnapshot.email ? (
              <Text style={styles.muted}>{invoice.clientSnapshot.email}</Text>
            ) : null}
            {invoice.clientSnapshot.phone ? (
              <Text style={styles.muted}>{invoice.clientSnapshot.phone}</Text>
            ) : null}
          </View>

          <View style={[styles.partyBlock, { alignItems: 'flex-end' }]}>
            <Text style={styles.sectionLabel}>AMOUNT DUE</Text>
            <Text style={{ fontSize: 16, fontFamily: 'Helvetica-Bold' }}>
              {formatCurrencyPlain(invoice.amountDue)}
            </Text>
          </View>
        </View>

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

          {invoice.lineItems.map((line, index) => (
            <View key={line.id} style={styles.tableRow} wrap={false}>
              <Text style={styles.colIndex}>{index + 1}</Text>
              <Text style={styles.colDesc}>{line.description}</Text>
              <Text style={styles.colHsn}>{line.hsnSac || '-'}</Text>
              <Text style={styles.colQty}>
                {line.quantity} {line.unit}
              </Text>
              <Text style={styles.colRate}>{formatCurrencyPlain(line.unitPrice)}</Text>
              <Text style={styles.colTax}>{line.taxRate}%</Text>
              <Text style={styles.colAmount}>{formatCurrencyPlain(line.lineTotal)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsWrap} wrap={false}>
          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text style={styles.muted}>Subtotal</Text>
              <Text>{formatCurrencyPlain(invoice.subtotal)}</Text>
            </View>

            {invoice.discountAmount > 0 ? (
              <View style={styles.totalRow}>
                <Text style={styles.muted}>
                  Discount
                  {invoice.discountType === 'percentage'
                    ? ` (${invoice.discountValue}%)`
                    : ''}
                </Text>
                <Text>-{formatCurrencyPlain(invoice.discountAmount)}</Text>
              </View>
            ) : null}

            {breakdown
              .filter((row) => row.rate > 0)
              .map((row) => (
                <View key={row.rate} style={styles.totalRow}>
                  <Text style={styles.muted}>
                    Tax @ {row.rate}% on {formatCurrencyPlain(row.taxable)}
                  </Text>
                  <Text>{formatCurrencyPlain(row.tax)}</Text>
                </View>
              ))}

            <View style={styles.grandRow}>
              <Text style={styles.grandText}>Total</Text>
              <Text style={styles.grandText}>{formatCurrencyPlain(invoice.total)}</Text>
            </View>

            <View style={styles.totalRow}>
              <Text style={styles.muted}>Paid</Text>
              <Text>{formatCurrencyPlain(invoice.amountPaid)}</Text>
            </View>

            <View style={styles.balanceRow}>
              <Text style={styles.bold}>Balance due</Text>
              <Text style={styles.bold}>{formatCurrencyPlain(invoice.amountDue)}</Text>
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
