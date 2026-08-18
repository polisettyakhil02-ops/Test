import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { entities, users } from '@/db/schema'
import { config, SESSION_COOKIE } from '@/lib/config'
import { forbidden, unauthorized } from '@/lib/errors'

export type Role = 'admin' | 'accountant' | 'viewer'

export interface Session {
  userId: string
  email: string
  name: string
  role: Role
  entityId: string
  entityName: string
}

declare module 'express-serve-static-core' {
  interface Request {
    session?: Session
  }
}

interface TokenPayload {
  sub: string
  email: string
  name: string
  role: Role
}

export function issueToken(user: { id: string; email: string; name: string; role: string }) {
  const payload: TokenPayload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role as Role,
  }
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.sessionMaxAgeSeconds })
}

/**
 * Resolves the session from the cookie, or from a bearer token.
 *
 * The cookie is what the browser app uses. The header is there for scripts and
 * for anything that cannot hold a cookie -- a cron job hitting a report, say.
 */
export async function loadSession(req: Request): Promise<Session | null> {
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null
  const token = bearer ?? (req.cookies?.[SESSION_COOKIE] as string | undefined)
  if (!token) return null

  let payload: TokenPayload
  try {
    payload = jwt.verify(token, config.jwtSecret) as TokenPayload
  } catch {
    return null
  }

  // The role is re-read from the database rather than trusted from the token,
  // so revoking someone's access takes effect on their next request instead of
  // whenever their token happens to expire.
  const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1)
  if (!user || !user.isActive) return null

  // Single-tenant: exactly one entity, created by the setup script.
  const [entity] = await db.select().from(entities).limit(1)
  if (!entity) return null

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role as Role,
    entityId: entity.id,
    entityName: entity.name,
  }
}

/** Attaches the session when there is one, without demanding it. */
export async function withSession(req: Request, _res: Response, next: NextFunction) {
  try {
    req.session = (await loadSession(req)) ?? undefined
    next()
  } catch (error) {
    next(error)
  }
}

const RANK: Record<Role, number> = { viewer: 0, accountant: 1, admin: 2 }

export function can(role: Role, atLeast: Role): boolean {
  return RANK[role] >= RANK[atLeast]
}

/**
 * Guards a route. Every write goes through `requireRole('accountant')` or
 * stricter -- an HTTP API is a public endpoint whatever the front end renders.
 */
export function requireRole(atLeast: Role) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.session) return next(unauthorized())
    if (!can(req.session.role, atLeast)) {
      return next(forbidden(`You need the ${atLeast} role to do that.`))
    }
    next()
  }
}

export const requireAuth = requireRole('viewer')

/** The session, for handlers that run behind `requireAuth`. */
export function sessionOf(req: Request): Session {
  if (!req.session) throw unauthorized()
  return req.session
}
