/**
 * Unwraps the sole element of a single-document `Model.create([input], opts)`
 * call. Needed because `noUncheckedIndexedAccess` types array-destructuring
 * as possibly-`undefined`; this makes the "impossible" case an explicit,
 * typed failure instead of a silent `!` assertion.
 */
export function firstOrThrow<T>(items: T[], message: string): T {
  const [first] = items;
  if (first === undefined) {
    throw new Error(message);
  }
  return first;
}
