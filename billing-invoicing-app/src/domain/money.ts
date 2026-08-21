/**
 * Money is integer minor units (paise). No floats anywhere in this file.
 *
 * The previous implementation carried rupees as JS numbers and repaired the
 * damage with a round2() helper at every boundary. Integers remove the class of
 * bug instead of patching its symptoms.
 */

export type Minor = number

/** Quantities carry 3 decimal places, held as an integer scaled by 1000. */
export const QTY_SCALE = 1000
/** Percentages carry 2 decimal places, held as an integer scaled by 100. */
export const PCT_SCALE = 100

/** Half-up division for positive divisors, staying in integer space. */
export function divRound(numerator: number, denominator: number): number {
  if (denominator <= 0) throw new Error('denominator must be positive')
  const sign = numerator < 0 ? -1 : 1
  const n = Math.abs(numerator)
  return sign * Math.floor((n + Math.floor(denominator / 2)) / denominator)
}

/** "1.5" -> 1500. Rejects anything that is not a finite decimal. */
export function parseQty(value: string | number): number {
  return parseScaled(value, QTY_SCALE, 'quantity')
}

/** "18" -> 1800, "2.5" -> 250. */
export function parsePercent(value: string | number): number {
  return parseScaled(value, PCT_SCALE, 'percentage')
}

/** "1500.50" -> 150050 paise. */
export function parseMinor(value: string | number): Minor {
  return parseScaled(value, 100, 'amount')
}

function parseScaled(value: string | number, scale: number, label: string): number {
  const text = String(value).trim()
  if (!/^-?\d*(\.\d+)?$/.test(text) || text === '' || text === '-') {
    throw new Error(`Invalid ${label}: ${JSON.stringify(value)}`)
  }
  const negative = text.startsWith('-')
  const [whole, fraction = ''] = text.replace('-', '').split('.')
  const digits = String(scale).length - 1
  const padded = (fraction + '0'.repeat(digits)).slice(0, digits)
  const dropped = fraction.slice(digits)
  let result = Number(whole || '0') * scale + Number(padded || '0')
  // Round rather than truncate when more precision was supplied than we keep.
  if (dropped && Number(dropped[0]) >= 5) result += 1
  return negative ? -result : result
}

/** 150050 -> "1500.50" */
export function formatMinor(minor: Minor): string {
  const negative = minor < 0
  const abs = Math.abs(minor)
  const whole = Math.floor(abs / 100)
  const cents = abs % 100
  return `${negative ? '-' : ''}${whole}.${String(cents).padStart(2, '0')}`
}

/** Indian digit grouping, e.g. 1234567891 -> "1,23,45,678.91". */
export function formatMinorIN(minor: Minor): string {
  const negative = minor < 0
  const abs = Math.abs(minor)
  const whole = String(Math.floor(abs / 100))
  const cents = String(abs % 100).padStart(2, '0')

  let grouped: string
  if (whole.length <= 3) {
    grouped = whole
  } else {
    const last3 = whole.slice(-3)
    const rest = whole.slice(0, -3)
    grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3
  }

  return `${negative ? '-' : ''}${grouped}.${cents}`
}

/** quantity(scaled) x unit price(minor) -> line amount(minor). */
export function extendLine(qtyScaled: number, unitPriceMinor: Minor): Minor {
  return divRound(qtyScaled * unitPriceMinor, QTY_SCALE)
}

/** amount(minor) x percent(scaled) -> tax(minor). */
export function applyPercent(baseMinor: Minor, percentScaled: number): Minor {
  return divRound(baseMinor * percentScaled, 100 * PCT_SCALE)
}

/**
 * Splits `total` across `weights` so the parts sum to exactly `total`.
 *
 * Largest-remainder: distribute the floor of each share, then hand the leftover
 * units out one at a time to the largest remainders. Naive per-line rounding
 * loses or invents paise, and on a discount that means the invoice no longer
 * adds up.
 */
export function apportion(total: Minor, weights: number[]): Minor[] {
  const totalWeight = weights.reduce((sum, w) => sum + w, 0)

  if (totalWeight <= 0 || total === 0) {
    return weights.map(() => 0)
  }

  const shares = weights.map((w) => {
    const exact = total * w
    return { base: Math.floor(exact / totalWeight), remainder: exact % totalWeight }
  })

  const distributed = shares.reduce((sum, s) => sum + s.base, 0)
  let leftover = total - distributed

  const order = shares
    .map((s, index) => ({ index, remainder: s.remainder }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)

  const result = shares.map((s) => s.base)
  let cursor = 0
  while (leftover > 0 && order.length > 0) {
    result[order[cursor % order.length].index] += 1
    leftover -= 1
    cursor += 1
  }

  return result
}
