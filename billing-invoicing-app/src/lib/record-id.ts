/**
 * Record ids arriving from the URL.
 *
 * Kept apart from `queries.ts` for the same reason as `paging.ts`: that module
 * opens a database connection at import time, and this is arithmetic on a
 * string.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Whether a string could be a record id at all.
 *
 * Ids come out of the URL, so they are user input. "Not a uuid" and "no such
 * record" are the same answer to the caller -- there is no such thing -- but
 * only one of them is what happens if the string reaches PostgreSQL, which
 * raises `invalid input syntax for type uuid` and turns an honest 404 into a
 * 500.
 *
 * Checking once, at the lookup, rather than at each call site is deliberate.
 * Call sites that remembered a `.catch(() => null)` also swallowed real
 * database failures into a 404; the ones that forgot returned a 500 for a
 * typo'd URL. Neither is the caller's problem to remember.
 */
export function isRecordId(id: string): boolean {
  return UUID.test(id)
}
