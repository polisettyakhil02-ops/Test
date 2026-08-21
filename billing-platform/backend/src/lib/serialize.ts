/**
 * Renames Mongo's `_id` to the `id` the API, the zod schemas and the browser
 * all already expect.
 *
 * Keeping `_id` as the on-disk field name (Mongo requires it to be called
 * that) but never letting it leak past the query layer means nothing above
 * `lib/queries.ts` had to change shape when the database underneath did.
 */
export function withId<T extends { _id: string }>(doc: T): Omit<T, '_id'> & { id: string } {
  const { _id, ...rest } = doc
  return { id: _id, ...rest }
}
