import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { PostingError } from '@/domain/posting'

/**
 * One error shape for the whole API: `{ error, fieldErrors? }`.
 *
 * The front end never has to guess how a failure is expressed, and nothing
 * leaks a stack trace or a driver message to the browser.
 */

export class HttpError extends Error {
  status: number
  fieldErrors?: Record<string, string>

  constructor(status: number, message: string, fieldErrors?: Record<string, string>) {
    super(message)
    this.status = status
    this.fieldErrors = fieldErrors
    this.name = 'HttpError'
  }
}

export const badRequest = (message: string, fieldErrors?: Record<string, string>) =>
  new HttpError(400, message, fieldErrors)
export const unauthorized = (message = 'Sign in to continue.') => new HttpError(401, message)
export const forbidden = (message = 'You do not have permission to do that.') =>
  new HttpError(403, message)
export const notFound = (message = 'Not found.') => new HttpError(404, message)

/** Turns a zod error into the field map the forms render. */
export function fieldErrorsOf(error: ZodError): Record<string, string> {
  const result: Record<string, string> = {}
  for (const issue of error.issues) {
    const path = issue.path.join('.')
    if (!(path in result)) result[path] = issue.message
  }
  return result
}

/**
 * A route parameter as a string.
 *
 * Express 5 types `req.params` values as `string | string[]`, because a
 * wildcard segment can repeat. Ours never do, so this narrows once here rather
 * than at every call site.
 */
export function param(req: Request, name: string): string {
  const value = req.params[name]
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

/** Wraps an async handler so a rejected promise reaches the error middleware. */
export function handler<T extends Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req as T, res, next)).catch(next)
  }
}

/**
 * The two MongoDB server error codes a business rule can surface as. 11000 is
 * a unique-index violation (a duplicate email, a document number already
 * taken); 121 is a document-validator rejection (an unbalanced journal entry,
 * a posted document with no number — see db/indexes.ts). Both are the
 * database refusing a write for a reason a human should see, not a server
 * fault, so both come back as a 409 with a message written for a person rather
 * than the driver's own wording, which quotes the raw document back at you.
 */
const DUPLICATE_KEY = 11000
const VALIDATION_FAILED = 121

function friendlyMongoMessage(error: { code?: number; keyPattern?: Record<string, unknown> }): string | null {
  if (error.code === DUPLICATE_KEY) {
    const field = Object.keys(error.keyPattern ?? {})[0]
    return field
      ? `That ${field === 'email' ? 'email address' : field} is already in use.`
      : 'That value is already in use.'
  }
  if (error.code === VALIDATION_FAILED) {
    return 'That change would leave the record in an invalid state and was refused.'
  }
  return null
}

export function errorMiddleware(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message, fieldErrors: error.fieldErrors ?? {} })
    return
  }

  if (error instanceof ZodError) {
    res.status(400).json({ error: 'Please fix the highlighted fields.', fieldErrors: fieldErrorsOf(error) })
    return
  }

  // A refusal from the posting rules is the user's answer, not a server fault.
  if (error instanceof PostingError) {
    res.status(409).json({ error: error.message, fieldErrors: {} })
    return
  }

  const mongoMessage = friendlyMongoMessage(error as { code?: number; keyPattern?: Record<string, unknown> })
  if (mongoMessage) {
    res.status(409).json({ error: mongoMessage, fieldErrors: {} })
    return
  }

  console.error('Unhandled error:', error)
  res.status(500).json({ error: 'Something went wrong on the server.', fieldErrors: {} })
}
