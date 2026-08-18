import {
  apportion,
  applyPercent,
  extendLine,
  parsePercent,
  parseQty,
  type Minor,
} from '@/domain/money'

/**
 * Pricing and GST for a document, in integer minor units.
 *
 * Same two rules the old implementation got right, now with the tax split into
 * the components a GST invoice legally has to show:
 *   - an invoice-level discount is apportioned across lines by share of value
 *   - tax is charged on the post-discount amount
 */

export type SupplyKind = 'intra_state' | 'inter_state' | 'exempt'
export type DiscountType = 'percentage' | 'fixed'

export interface PriceableLine {
  description: string
  quantity: string
  unitPriceMinor: Minor
  taxRatePercent: string
}

export interface TaxComponent {
  component: 'CGST' | 'SGST' | 'IGST'
  ratePercent: string
  taxableMinor: Minor
  amountMinor: Minor
}

export interface PricedLine {
  lineSubtotalMinor: Minor
  lineDiscountMinor: Minor
  lineTaxMinor: Minor
  lineTotalMinor: Minor
  taxes: TaxComponent[]
}

export interface PricedDocument {
  lines: PricedLine[]
  subtotalMinor: Minor
  discountMinor: Minor
  taxMinor: Minor
  totalMinor: Minor
}

export interface PricingInput {
  lines: PriceableLine[]
  discountType: DiscountType
  discountValue: string
  supplyKind: SupplyKind
}

/** Halves a rate for the CGST/SGST split, keeping 2dp: "18" -> "9". */
function halfRate(percentScaled: number): string {
  const half = percentScaled / 2
  const whole = Math.floor(half / 100)
  const cents = Math.round(half % 100)
  return cents === 0 ? String(whole) : `${whole}.${String(cents).padStart(2, '0')}`
}

/**
 * Splits a line's tax into its statutory components.
 *
 * Intra-state supply is CGST + SGST at half the rate each; inter-state is a
 * single IGST at the full rate. The two halves must still sum to the total tax
 * to the paisa, so the second component takes the remainder rather than being
 * rounded independently.
 */
function splitTax(
  taxableMinor: Minor,
  rateScaled: number,
  supplyKind: SupplyKind,
): { total: Minor; components: TaxComponent[] } {
  if (supplyKind === 'exempt' || rateScaled === 0 || taxableMinor === 0) {
    return { total: 0, components: [] }
  }

  const total = applyPercent(taxableMinor, rateScaled)

  if (supplyKind === 'inter_state') {
    return {
      total,
      components: [
        {
          component: 'IGST',
          ratePercent: formatRate(rateScaled),
          taxableMinor,
          amountMinor: total,
        },
      ],
    }
  }

  const cgst = Math.floor(total / 2)
  const sgst = total - cgst
  const half = halfRate(rateScaled)

  return {
    total,
    components: [
      { component: 'CGST', ratePercent: half, taxableMinor, amountMinor: cgst },
      { component: 'SGST', ratePercent: half, taxableMinor, amountMinor: sgst },
    ],
  }
}

function formatRate(scaled: number): string {
  const whole = Math.floor(scaled / 100)
  const cents = scaled % 100
  return cents === 0 ? String(whole) : `${whole}.${String(cents).padStart(2, '0')}`
}

export function priceDocument(input: PricingInput): PricedDocument {
  const subtotals = input.lines.map((line) =>
    extendLine(parseQty(line.quantity), line.unitPriceMinor),
  )

  const subtotalMinor = subtotals.reduce((sum, value) => sum + value, 0)

  const rawDiscount =
    input.discountType === 'percentage'
      ? applyPercent(subtotalMinor, parsePercent(input.discountValue))
      : Math.round(Number(input.discountValue) * 100)

  // Never discount below zero, never above the subtotal.
  const discountMinor = Math.min(Math.max(rawDiscount, 0), subtotalMinor)

  const lineDiscounts = apportion(discountMinor, subtotals)

  const lines: PricedLine[] = input.lines.map((line, index) => {
    const lineSubtotalMinor = subtotals[index]
    const lineDiscountMinor = lineDiscounts[index]
    const taxable = lineSubtotalMinor - lineDiscountMinor
    const { total, components } = splitTax(
      taxable,
      parsePercent(line.taxRatePercent),
      input.supplyKind,
    )

    return {
      lineSubtotalMinor,
      lineDiscountMinor,
      lineTaxMinor: total,
      lineTotalMinor: taxable + total,
      taxes: components,
    }
  })

  const taxMinor = lines.reduce((sum, line) => sum + line.lineTaxMinor, 0)

  return {
    lines,
    subtotalMinor,
    discountMinor,
    taxMinor,
    totalMinor: subtotalMinor - discountMinor + taxMinor,
  }
}

/** Groups tax by component and rate for the invoice's GST summary. */
export function taxSummary(lines: PricedLine[]) {
  const byKey = new Map<
    string,
    { component: string; ratePercent: string; taxableMinor: Minor; amountMinor: Minor }
  >()

  for (const line of lines) {
    for (const tax of line.taxes) {
      const key = `${tax.component}@${tax.ratePercent}`
      const existing = byKey.get(key) ?? {
        component: tax.component,
        ratePercent: tax.ratePercent,
        taxableMinor: 0,
        amountMinor: 0,
      }
      existing.taxableMinor += tax.taxableMinor
      existing.amountMinor += tax.amountMinor
      byKey.set(key, existing)
    }
  }

  return [...byKey.values()].sort(
    (a, b) =>
      Number(a.ratePercent) - Number(b.ratePercent) ||
      a.component.localeCompare(b.component),
  )
}

/**
 * Which GST applies: same state as the seller means CGST+SGST, anywhere else
 * in India means IGST. Getting this wrong is one of the most common ways a
 * small business's returns fail to reconcile.
 */
export function resolveSupplyKind(
  sellerStateCode: string,
  buyerStateCode: string,
): SupplyKind {
  const seller = sellerStateCode.trim()
  const buyer = buyerStateCode.trim()
  if (!seller || !buyer) return 'intra_state'
  return seller === buyer ? 'intra_state' : 'inter_state'
}
