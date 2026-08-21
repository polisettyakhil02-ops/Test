import { formatMinor, type Minor } from '@/domain/money'

/**
 * e-Invoicing (IRN) payload generation.
 *
 * Under the Indian e-invoicing mandate a B2B invoice is not valid until it has
 * been registered with an Invoice Registration Portal, which returns an IRN, an
 * acknowledgement number and a signed QR string that the printed invoice must
 * carry.
 *
 * This module builds the JSON the IRP expects (NIC schema 1.1) and checks the
 * invoice is registrable before you try. It deliberately does not call an IRP:
 * that needs a GSP contract and credentials this business does not have yet, and
 * a half-configured HTTP client is worse than an explicit hand-off. You download
 * the payload, register it through whichever portal you use, and record what
 * comes back.
 *
 * Amounts in the NIC schema are decimal rupees, not paise -- the one place in
 * this codebase where money leaves integer space, because the schema says so.
 */

export interface EinvoiceSeller {
  gstin: string
  legalName: string
  addressLines: string[]
  city: string
  pincode: string
  stateCode: string
  phone: string
  email: string
}

export interface EinvoiceBuyer {
  gstin: string
  legalName: string
  address: string
  city: string
  pincode: string
  stateCode: string
  placeOfSupply: string
  phone: string
  email: string
}

export interface EinvoiceLine {
  description: string
  hsnSac: string
  unit: string
  quantity: string
  unitPriceMinor: Minor
  taxRatePercent: string
  lineSubtotalMinor: Minor
  lineDiscountMinor: Minor
  lineTaxMinor: Minor
  lineTotalMinor: Minor
}

export interface EinvoiceInput {
  docType: 'invoice' | 'credit_note'
  docNumber: string
  issueDate: string
  status: string
  supplyKind: string
  reverseCharge?: boolean
  seller: EinvoiceSeller
  buyer: EinvoiceBuyer
  discountMinor: Minor
  totalMinor: Minor
  lines: EinvoiceLine[]
}

/** A reason this invoice cannot be registered, in the words the user needs. */
export interface Blocker {
  field: string
  message: string
}

/** 2 digits state · 10 char PAN · entity code · 'Z' · checksum. */
const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z\d][A-Z\d]$/

/**
 * The IRP rejects a malformed payload with a numeric error code and no context.
 * Checking here means the user is told what to fix in their own data instead.
 */
export function einvoiceBlockers(input: EinvoiceInput): Blocker[] {
  const blockers: Blocker[] = []

  if (input.status !== 'posted') {
    blockers.push({
      field: 'status',
      message: 'Only a posted document can be registered. Post it first.',
    })
  }

  if (!input.docNumber) {
    blockers.push({ field: 'docNumber', message: 'The document has no number yet.' })
  }

  if (!GSTIN_PATTERN.test(input.seller.gstin)) {
    blockers.push({
      field: 'seller.gstin',
      message: 'Your own GSTIN is missing or malformed. Set it on the entity.',
    })
  }

  if (!GSTIN_PATTERN.test(input.buyer.gstin)) {
    blockers.push({
      field: 'buyer.gstin',
      message:
        'e-Invoicing applies to registered buyers. This client has no valid GSTIN, so no IRN is required.',
    })
  }

  if (!/^\d{6}$/.test(input.seller.pincode)) {
    blockers.push({ field: 'seller.pincode', message: 'Your address needs a 6-digit PIN code.' })
  }

  if (!/^\d{6}$/.test(input.buyer.pincode)) {
    blockers.push({
      field: 'buyer.pincode',
      message: "The client's billing address needs a 6-digit PIN code.",
    })
  }

  const missingHsn = input.lines.filter((line) => !/^\d{4,8}$/.test(line.hsnSac))
  if (missingHsn.length > 0) {
    blockers.push({
      field: 'lines.hsnSac',
      message: `${missingHsn.length} line${missingHsn.length === 1 ? '' : 's'} need a 4–8 digit HSN/SAC code.`,
    })
  }

  if (input.lines.length === 0) {
    blockers.push({ field: 'lines', message: 'The document has no lines.' })
  }

  return blockers
}

/** 2026-08-17 -> 17/08/2026, the only date format the schema accepts. */
export function toIrpDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}

/** Paise -> the decimal rupee number the schema carries. */
function rupees(minor: Minor): number {
  return Number(formatMinor(minor))
}

export interface EinvoicePayload {
  Version: string
  TranDtls: { TaxSch: string; SupTyp: string; RegRev: string; IgstOnIntra: string }
  DocDtls: { Typ: string; No: string; Dt: string }
  SellerDtls: Record<string, string | number>
  BuyerDtls: Record<string, string | number>
  ItemList: Array<Record<string, string | number>>
  ValDtls: Record<string, number>
}

/**
 * The NIC 1.1 payload for one document.
 *
 * The tax split is derived from the supply kind exactly as the ledger derived
 * it at posting time, so the IRP sees the same CGST/SGST or IGST the customer's
 * copy of the invoice shows.
 */
export function buildEinvoicePayload(input: EinvoiceInput): EinvoicePayload {
  const interState = input.supplyKind === 'inter_state'

  let cgstTotal = 0
  let sgstTotal = 0
  let igstTotal = 0
  let assessableTotal = 0

  const items = input.lines.map((line, index) => {
    const assessable = line.lineSubtotalMinor - line.lineDiscountMinor
    const igst = interState ? line.lineTaxMinor : 0
    const cgst = interState ? 0 : Math.floor(line.lineTaxMinor / 2)
    const sgst = interState ? 0 : line.lineTaxMinor - cgst

    assessableTotal += assessable
    igstTotal += igst
    cgstTotal += cgst
    sgstTotal += sgst

    return {
      SlNo: String(index + 1),
      PrdDesc: line.description.slice(0, 300),
      // Everything is billed as a good unless it carries a SAC (99xxxx).
      IsServc: line.hsnSac.startsWith('99') ? 'Y' : 'N',
      HsnCd: line.hsnSac,
      Qty: Number(line.quantity),
      Unit: line.unit.toUpperCase().slice(0, 8),
      UnitPrice: rupees(line.unitPriceMinor),
      TotAmt: rupees(line.lineSubtotalMinor),
      Discount: rupees(line.lineDiscountMinor),
      AssAmt: rupees(assessable),
      GstRt: Number(line.taxRatePercent),
      IgstAmt: rupees(igst),
      CgstAmt: rupees(cgst),
      SgstAmt: rupees(sgst),
      TotItemVal: rupees(line.lineTotalMinor),
    }
  })

  return {
    Version: '1.1',
    TranDtls: {
      TaxSch: 'GST',
      SupTyp: 'B2B',
      RegRev: input.reverseCharge ? 'Y' : 'N',
      IgstOnIntra: 'N',
    },
    DocDtls: {
      Typ: input.docType === 'credit_note' ? 'CRN' : 'INV',
      No: input.docNumber,
      Dt: toIrpDate(input.issueDate),
    },
    SellerDtls: {
      Gstin: input.seller.gstin,
      LglNm: input.seller.legalName,
      Addr1: input.seller.addressLines[0] ?? '',
      Addr2: input.seller.addressLines[1] ?? '',
      Loc: input.seller.city,
      Pin: Number(input.seller.pincode),
      Stcd: input.seller.stateCode,
      Ph: input.seller.phone,
      Em: input.seller.email,
    },
    BuyerDtls: {
      Gstin: input.buyer.gstin,
      LglNm: input.buyer.legalName,
      Pos: input.buyer.placeOfSupply || input.buyer.stateCode,
      Addr1: input.buyer.address,
      Loc: input.buyer.city,
      Pin: Number(input.buyer.pincode),
      Stcd: input.buyer.stateCode,
      Ph: input.buyer.phone,
      Em: input.buyer.email,
    },
    ItemList: items,
    ValDtls: {
      AssVal: rupees(assessableTotal),
      CgstVal: rupees(cgstTotal),
      SgstVal: rupees(sgstTotal),
      IgstVal: rupees(igstTotal),
      // Document-level rounding is not used here: line totals already sum to
      // the document total exactly, because the discount was apportioned in
      // integer paise rather than rounded per line.
      RndOffAmt: 0,
      TotInvVal: rupees(input.totalMinor),
    },
  }
}

/**
 * The QR string an IRP returns is a signed JWT. Its payload carries the fields
 * a GST officer's app reads off the printed invoice; being able to show them
 * back means a recorded QR can be sanity-checked rather than trusted blindly.
 */
export function decodeSignedQr(signed: string): Record<string, unknown> | null {
  const parts = signed.split('.')
  if (parts.length !== 3) return null

  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8')
    const outer = JSON.parse(json) as Record<string, unknown>
    // NIC nests the invoice fields in a `data` string that is itself JSON.
    if (typeof outer.data === 'string') {
      return JSON.parse(outer.data) as Record<string, unknown>
    }
    return outer
  } catch {
    return null
  }
}
