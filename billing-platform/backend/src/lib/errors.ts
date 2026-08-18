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

interface DriverError {
  code?: string
  constraint?: string
  message?: string
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

  // Drizzle wraps driver errors; the useful detail is on `cause`. A trigger
  // firing is a business rule being enforced, so it comes back as a 409 with
  // the database's own message, which is written for a human.
  const cause = (error as { cause?: DriverError })?.cause
  if (cause?.code === 'restrict_violation' || cause?.code === 'check_violation' || cause?.constraint) {
    res.status(409).json({ error: cause.message ?? 'That change was refused.', fieldErrors: {} })
    return
  }

  console.error('Unhandled error:', error)
  res.status(500).json({ error: 'Something went wrong on the server.', fieldErrors: {} })
}
