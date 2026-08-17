import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  B2CL_THRESHOLD_MINOR,
  buildGstr1,
  gstr1ToCsv,
  ratesOf,
  sectionFor,
  type ReturnDocument,
} from '@/domain/gst-returns'

/**
 * GSTR-1 sectioning is the rule most worth testing in this codebase: it is
 * decided by the buyer rather than by us, the portal rejects a return that gets
 * it wrong, and nothing in the type system stops the wrong branch being taken.
 */

const PERIOD = { from: '2026-08-01', to: '2026-08-31' }

function doc(overrides: Partial<ReturnDocument> = {}): ReturnDocument {
  return {
    docType: 'invoice',
    docNumber: 'INV-00001',
    issueDate: '2026-08-10',
    status: 'posted',
    buyerGstin: '',
    buyerName: 'Globex',
    placeOfSupply: '29',
    supplyKind: 'intra_state',
    totalMinor: 118_00,
    lines: [
      {
        description: 'Consulting',
        hsnSac: '998311',
        unit: 'hour',
        quantity: '1',
        taxRatePercent: '18',
        lineSubtotalMinor: 100_00,
        lineDiscountMinor: 0,
        lineTaxMinor: 18_00,
      },
    ],
    ...overrides,
  }
}

const REGISTERED = '29AABCU9603R1ZX'

describe('which section a document is filed in', () => {
  test('a registered buyer is B2B', () => {
    assert.equal(sectionFor(doc({ buyerGstin: REGISTERED })), 'B2B')
  })

  test('an unregistered intra-state buyer is B2CS whatever the value', () => {
    const large = doc({ totalMinor: B2CL_THRESHOLD_MINOR * 4, supplyKind: 'intra_state' })
    assert.equal(sectionFor(large), 'B2CS')
  })

  test('an unregistered inter-state buyer above the threshold is B2CL', () => {
    const above = doc({ supplyKind: 'inter_state', totalMinor: B2CL_THRESHOLD_MINOR + 1 })
    assert.equal(sectionFor(above), 'B2CL')
  })

  test('exactly at the threshold is still B2CS -- the rule is "above"', () => {
    const at = doc({ supplyKind: 'inter_state', totalMinor: B2CL_THRESHOLD_MINOR })
    assert.equal(sectionFor(at), 'B2CS')
  })

  test('a credit note to a registered buyer is CDNR', () => {
    assert.equal(sectionFor(doc({ docType: 'credit_note', buyerGstin: REGISTERED })), 'CDNR')
  })

  test('a credit note to an unregistered buyer nets into B2CS instead', () => {
    assert.equal(sectionFor(doc({ docType: 'credit_note' })), 'B2CS')
  })

  test('drafts, voided documents and payments are not filed', () => {
    assert.equal(sectionFor(doc({ status: 'draft' })), 'EXCLUDED')
    assert.equal(sectionFor(doc({ status: 'voided' })), 'EXCLUDED')
    assert.equal(sectionFor(doc({ docType: 'payment' })), 'EXCLUDED')
  })

  test('whitespace is not a GSTIN', () => {
    assert.equal(sectionFor(doc({ buyerGstin: '   ' })), 'B2CS')
  })
})

describe('rate rows', () => {
  test('lines at the same rate collapse into one row', () => {
    const rates = ratesOf(
      doc({
        lines: [
          {
            description: 'A',
            hsnSac: '1',
            unit: 'unit',
            quantity: '1',
            taxRatePercent: '18',
            lineSubtotalMinor: 100_00,
            lineDiscountMinor: 0,
            lineTaxMinor: 18_00,
          },
          {
            description: 'B',
            hsnSac: '2',
            unit: 'unit',
            quantity: '1',
            taxRatePercent: '18',
            lineSubtotalMinor: 50_00,
            lineDiscountMinor: 10_00,
            lineTaxMinor: 7_20,
          },
        ],
      }),
    )

    assert.equal(rates.length, 1)
    // Taxable value is net of the discount, matching what the tax was charged on.
    assert.equal(rates[0].taxableMinor, 140_00)
    assert.equal(rates[0].taxMinor, 25_20)
  })

  test('different rates stay separate and come back in ascending order', () => {
    const rates = ratesOf(
      doc({
        lines: [
          {
            description: 'A',
            hsnSac: '1',
            unit: 'unit',
            quantity: '1',
            taxRatePercent: '18',
            lineSubtotalMinor: 100_00,
            lineDiscountMinor: 0,
            lineTaxMinor: 18_00,
          },
          {
            description: 'B',
            hsnSac: '2',
            unit: 'unit',
            quantity: '1',
            taxRatePercent: '5',
            lineSubtotalMinor: 200_00,
            lineDiscountMinor: 0,
            lineTaxMinor: 10_00,
          },
        ],
      }),
    )

    assert.deepEqual(
      rates.map((r) => r.ratePercent),
      ['5', '18'],
    )
  })
})

describe('building the return', () => {
  test('documents outside the period are ignored', () => {
    const report = buildGstr1(
      [doc({ issueDate: '2026-07-31' }), doc({ issueDate: '2026-09-01' })],
      PERIOD,
    )
    assert.equal(report.totals.documentCount, 0)
  })

  test('a credit note reduces the totals rather than adding to them', () => {
    const invoice = doc({ buyerGstin: REGISTERED })
    const note = doc({
      docType: 'credit_note',
      docNumber: 'CRN-00001',
      buyerGstin: REGISTERED,
      correctsDocNumber: 'INV-00001',
      correctsDocDate: '2026-08-10',
    })

    const report = buildGstr1([invoice, note], PERIOD)

    assert.equal(report.totals.documentCount, 2)
    // Invoice and note are identical in value, so they cancel exactly.
    assert.equal(report.totals.taxableMinor, 0)
    assert.equal(report.totals.taxMinor, 0)
    assert.equal(report.cdnr.length, 1)
    assert.equal(report.cdnr[0].originalInvoiceNumber, 'INV-00001')
  })

  test('B2CS sums by place of supply and rate, netting credit notes off', () => {
    const report = buildGstr1(
      [
        doc({ placeOfSupply: '29' }),
        doc({ placeOfSupply: '29', docNumber: 'INV-00002' }),
        doc({ placeOfSupply: '27', docNumber: 'INV-00003' }),
        doc({ docType: 'credit_note', docNumber: 'CRN-00001', placeOfSupply: '29' }),
      ],
      PERIOD,
    )

    assert.equal(report.b2cs.length, 2)

    const karnataka = report.b2cs.find((row) => row.placeOfSupply === '29')
    // Two invoices of 100.00 taxable, less one credit note of 100.00.
    assert.equal(karnataka?.taxableMinor, 100_00)

    const maharashtra = report.b2cs.find((row) => row.placeOfSupply === '27')
    assert.equal(maharashtra?.taxableMinor, 100_00)
  })

  test('one B2B invoice at two rates produces one row per rate', () => {
    const report = buildGstr1(
      [
        doc({
          buyerGstin: REGISTERED,
          lines: [
            {
              description: 'A',
              hsnSac: '998311',
              unit: 'unit',
              quantity: '1',
              taxRatePercent: '18',
              lineSubtotalMinor: 100_00,
              lineDiscountMinor: 0,
              lineTaxMinor: 18_00,
            },
            {
              description: 'B',
              hsnSac: '1005',
              unit: 'kg',
              quantity: '2',
              taxRatePercent: '5',
              lineSubtotalMinor: 200_00,
              lineDiscountMinor: 0,
              lineTaxMinor: 10_00,
            },
          ],
        }),
      ],
      PERIOD,
    )

    assert.equal(report.b2b.length, 2)
    // The invoice value repeats on every rate row; the portal expects that, and
    // it is why summing that column would double-count.
    assert.deepEqual(new Set(report.b2b.map((r) => r.invoiceValueMinor)), new Set([118_00]))
    assert.equal(report.totals.taxableMinor, 300_00)
  })

  test('the HSN summary spans sections and is keyed by code', () => {
    const report = buildGstr1(
      [doc({ buyerGstin: REGISTERED }), doc({ docNumber: 'INV-00002' })],
      PERIOD,
    )

    assert.equal(report.hsn.length, 1)
    assert.equal(report.hsn[0].hsnSac, '998311')
    assert.equal(report.hsn[0].quantity, 2)
    assert.equal(report.hsn[0].taxableMinor, 200_00)
  })

  test('a line with no HSN code is still summarised, under a visible label', () => {
    const report = buildGstr1(
      [
        doc({
          lines: [
            {
              description: 'Misc',
              hsnSac: '',
              unit: 'unit',
              quantity: '1',
              taxRatePercent: '0',
              lineSubtotalMinor: 100_00,
              lineDiscountMinor: 0,
              lineTaxMinor: 0,
            },
          ],
        }),
      ],
      PERIOD,
    )

    assert.equal(report.hsn[0].hsnSac, '(none)')
  })
})

describe('CSV export', () => {
  test('sections with no rows are left out entirely', () => {
    const csv = gstr1ToCsv(buildGstr1([doc()], PERIOD))

    assert.match(csv, /B2CS/)
    assert.doesNotMatch(csv, /CDNR/)
  })

  test('a comma in a name cannot break the column layout', () => {
    const csv = gstr1ToCsv(
      buildGstr1([doc({ buyerGstin: REGISTERED, buyerName: 'Globex, Inc.' })], PERIOD),
    )

    assert.match(csv, /"Globex, Inc\."/)
  })

  test('amounts are plain decimals, not grouped or prefixed', () => {
    const csv = gstr1ToCsv(buildGstr1([doc({ buyerGstin: REGISTERED })], PERIOD))
    assert.match(csv, /,100\.00,/)
  })
})
