/** Rounds a currency amount to 2 decimal places, correcting for binary floating-point representation error before rounding. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
