import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildEinvoicePayload,
  decodeSignedQr,
  einvoiceBlockers,
  toIrpDate,
  type EinvoiceInput,
} from '@/domain/einvoice'
import { priceDocument } from '@/domain/pricing'
import { parseMinor } from '@/domain/money'

/**
 * The IRP rejects a malformed payload with a numeric code and no context, so
 * these tests are the only feedback loop available short of a live GSP account.
 * They pin the two things that actually go wrong: the tax split, and amounts
 * leaving integer space in the wrong unit.
 */

function input(overrides: Partial<EinvoiceInput> = {}): EinvoiceInput {
  return {
    docType: 'invoice',
    docNumber: 'INV-00001',
    issueDate: '2026-08-17',
    status: 'posted',
    supplyKind: 'intra_state',
    seller: {
      gstin: '29AABCU9603R1ZX',
      legalName: 'Acme Consulting Pvt Ltd',
      addressLines: ['4th Floor, MG Road', 'Bengaluru - 560001'],
      city: 'Bengaluru',
      pincode: '560001',
      stateCode: '29',
      phone: '9876543210',
      email: 'billing@acme.test',
    },
    buyer: {
      gstin: '27AAACG1234M1Z8',
      legalName: 'Globex India Pvt Ltd',
      address: 'Plot 12, Andheri East',
      city: 'Mumbai',
      pincode: '400069',
      stateCode: '27',
      placeOfSupply: '27',
      phone: '9812345678',
      email: 'ap@globex.test',
    },
    discountMinor: 0,
    totalMinor: 118_00,
    lines: [
      {
        description: 'Consulting',
        hsnSac: '998311',
        unit: 'hour',
        quantity: '1',
        unitPriceMinor: 100_00,
        taxRatePercent: '18',
        lineSubtotalMinor: 100_00,
        lineDiscountMinor: 0,
        lineTaxMinor: 18_00,
        lineTotalMinor: 118_00,
      },
    ],
    ...overrides,
  }
}

describe('registrability', () => {
  test('a complete posted invoice to a registered buyer has no blockers', () => {
    assert.deepEqual(einvoiceBlockers(input()), [])
  })

  test('a draft cannot be registered', () => {
    const blockers = einvoiceBlockers(input({ status: 'draft' }))
    assert.ok(blockers.some((b) => b.field === 'status'))
  })

  test('an unregistered buyer is reported as not needing an IRN, not as an error', () => {
    const blockers = einvoiceBlockers(
      input({ buyer: { ...input().buyer, gstin: '' } }),
    )
    const buyer = blockers.find((b) => b.field === 'buyer.gstin')
    assert.ok(buyer)
    assert.match(buyer.message, /no IRN is required/)
  })

  test('a GSTIN of the wrong shape is caught before it reaches the portal', () => {
    const blockers = einvoiceBlockers(
      input({ buyer: { ...input().buyer, gstin: '27AAACG1234M1Z' } }),
    )
    assert.ok(blockers.some((b) => b.field === 'buyer.gstin'))
  })

  test('missing HSN codes are counted, so you know how many lines to fix', () => {
    const blockers = einvoiceBlockers(
      input({
        lines: [
          { ...input().lines[0], hsnSac: '' },
          { ...input().lines[0], hsnSac: '12' },
          { ...input().lines[0], hsnSac: '998311' },
        ],
      }),
    )
    const hsn = blockers.find((b) => b.field === 'lines.hsnSac')
    assert.ok(hsn)
    assert.match(hsn.message, /^2 lines/)
  })

  test('a PIN code is required at both ends', () => {
    const blockers = einvoiceBlockers(
      input({
        seller: { ...input().seller, pincode: '' },
        buyer: { ...input().buyer, pincode: '40006' },
      }),
    )
    assert.ok(blockers.some((b) => b.field === 'seller.pincode'))
    assert.ok(blockers.some((b) => b.field === 'buyer.pincode'))
  })
})

describe('the payload', () => {
  test('dates are dd/mm/yyyy, which is the only format the schema takes', () => {
    assert.equal(toIrpDate('2026-08-17'), '17/08/2026')
    assert.equal(buildEinvoicePayload(input()).DocDtls.Dt, '17/08/2026')
  })

  test('amounts are decimal rupees, not paise', () => {
    const payload = buildEinvoicePayload(input())
    assert.equal(payload.ValDtls.TotInvVal, 118)
    assert.equal(payload.ItemList[0].AssAmt, 100)
    assert.equal(payload.ItemList[0].UnitPrice, 100)
  })

  test('an intra-state supply splits into CGST and SGST with no IGST', () => {
    const payload = buildEinvoicePayload(input({ supplyKind: 'intra_state' }))
    assert.equal(payload.ValDtls.CgstVal, 9)
    assert.equal(payload.ValDtls.SgstVal, 9)
    assert.equal(payload.ValDtls.IgstVal, 0)
  })

  test('an inter-state supply is a single IGST at the full rate', () => {
    const payload = buildEinvoicePayload(input({ supplyKind: 'inter_state' }))
    assert.equal(payload.ValDtls.IgstVal, 18)
    assert.equal(payload.ValDtls.CgstVal, 0)
    assert.equal(payload.ValDtls.SgstVal, 0)
  })

  test('an odd number of paise splits without losing one', () => {
    // 18% of 100.05 is 18.009 -> 18.01, which does not halve evenly.
    const priced = priceDocument({
      lines: [
        { description: 'x', quantity: '1', unitPriceMinor: parseMinor('100.05'), taxRatePercent: '18' },
      ],
      discountType: 'fixed',
      discountValue: '0',
      supplyKind: 'intra_state',
    })

    const payload = buildEinvoicePayload(
      input({
        totalMinor: priced.totalMinor,
        lines: [
          {
            ...input().lines[0],
            unitPriceMinor: parseMinor('100.05'),
            lineSubtotalMinor: priced.lines[0].lineSubtotalMinor,
            lineDiscountMinor: priced.lines[0].lineDiscountMinor,
            lineTaxMinor: priced.lines[0].lineTaxMinor,
            lineTotalMinor: priced.lines[0].lineTotalMinor,
          },
        ],
      }),
    )

    const halves = Number(payload.ValDtls.CgstVal) + Number(payload.ValDtls.SgstVal)
    assert.equal(Math.round(halves * 100), priced.taxMinor)
    assert.equal(
      Math.round(Number(payload.ValDtls.TotInvVal) * 100),
      priced.totalMinor,
    )
  })

  test('the document totals equal the sum of the item rows', () => {
    const payload = buildEinvoicePayload(
      input({
        totalMinor: 236_00,
        lines: [input().lines[0], { ...input().lines[0], description: 'Second' }],
      }),
    )

    const assessable = payload.ItemList.reduce((sum, item) => sum + Number(item.AssAmt), 0)
    assert.equal(payload.ValDtls.AssVal, assessable)
    assert.equal(payload.ItemList.length, 2)
    assert.deepEqual(
      payload.ItemList.map((item) => item.SlNo),
      ['1', '2'],
    )
  })

  test('a SAC is marked as a service, an HSN as a good', () => {
    const payload = buildEinvoicePayload(
      input({
        lines: [
          { ...input().lines[0], hsnSac: '998311' },
          { ...input().lines[0], hsnSac: '10059000' },
        ],
      }),
    )

    assert.equal(payload.ItemList[0].IsServc, 'Y')
    assert.equal(payload.ItemList[1].IsServc, 'N')
  })

  test('a credit note is typed CRN rather than INV', () => {
    assert.equal(buildEinvoicePayload(input({ docType: 'credit_note' })).DocDtls.Typ, 'CRN')
  })

  test('place of supply falls back to the buyer state when not set', () => {
    const payload = buildEinvoicePayload(
      input({ buyer: { ...input().buyer, placeOfSupply: '' } }),
    )
    assert.equal(payload.BuyerDtls.Pos, '27')
  })
})

describe('the signed QR the portal returns', () => {
  test('the invoice fields can be read back out of it', () => {
    const data = { SellerGstin: '29AABCU9603R1ZX', DocNo: 'INV-00001', TotInvVal: '118.00' }
    const jwt = [
      Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url'),
      Buffer.from(JSON.stringify({ data: JSON.stringify(data) })).toString('base64url'),
      'signature',
    ].join('.')

    assert.deepEqual(decodeSignedQr(jwt), data)
  })

  test('anything that is not a JWT decodes to null rather than throwing', () => {
    assert.equal(decodeSignedQr('not a jwt'), null)
    assert.equal(decodeSignedQr('a.b.c'), null)
    assert.equal(decodeSignedQr(''), null)
  })
})
