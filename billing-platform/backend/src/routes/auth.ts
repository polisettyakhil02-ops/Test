import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { config, SESSION_COOKIE, sessionCookieOptions } from '@/lib/config'
import { handler, unauthorized } from '@/lib/errors'
import { loginSchema } from '@/lib/validation'
import { issueToken, requireAuth, sessionOf } from '@/middleware/auth'

export const authRoutes = Router()

authRoutes.post(
  '/login',
  handler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body)

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1)

    // Compare against a dummy hash when the user does not exist, so a missing
    // account and a wrong password take the same time to answer. Otherwise the
    // response time tells an attacker which emails are real.
    const hash = user?.passwordHash ?? '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin'
    const ok = await bcrypt.compare(password, hash)

    if (!user || !user.isActive || !ok) {
      throw unauthorized('Those credentials do not match an account.')
    }

    const token = issueToken(user)
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions())

    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      // Returned as well as set as a cookie, so a non-browser client can use
      // the same endpoint with an Authorization header.
      token,
      expiresIn: config.sessionMaxAgeSeconds,
    })
  }),
)

authRoutes.post(
  '/logout',
  handler(async (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(), maxAge: undefined })
    res.json({ ok: true })
  }),
)

authRoutes.get(
  '/me',
  requireAuth,
  handler(async (req, res) => {
    const session = sessionOf(req)
    res.json({
      user: {
        id: session.userId,
        email: session.email,
        name: session.name,
        role: session.role,
      },
      entity: { id: session.entityId, name: session.entityName },
    })
  }),
)
