import { randomUUID } from 'node:crypto'

/**
 * Every id in this system, everywhere. A v4 UUID string rather than an
 * ObjectId: the zod validators, the API and the browser all already deal in
 * UUID strings (an ObjectId is a different shape and a different validation
 * rule), and using the same id type end to end means none of them had to
 * change when the database underneath did.
 */
export const newId = (): string => randomUUID()
