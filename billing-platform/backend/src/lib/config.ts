import { config as loadEnv } from 'dotenv'

loadEnv({ path: ['.env.local', '.env'], quiet: true })

/**
 * Every environment variable the server reads, validated once at boot.
 *
 * A missing secret should stop the process on start-up with a sentence you can
 * act on, not surface as a 500 on the first sign-in attempt at 6pm.
 */

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    console.error(`Missing ${name}. See .env.example.`)
    process.exit(1)
  }
  return value
}

const isProduction = process.env.NODE_ENV === 'production'

export const config = {
  isProduction,
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required('DATABASE_URL'),

  /** Signs the session token. Changing it signs everyone out. */
  jwtSecret: required('JWT_SECRET'),
  /** How long a sign-in lasts. */
  sessionMaxAgeSeconds: Number(process.env.SESSION_MAX_AGE_SECONDS ?? 60 * 60 * 12),

  /**
   * Origins the browser app is served from. The API is on a different origin to
   * the front end by design, so this is not optional -- an empty list means no
   * browser can talk to it.
   */
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  /**
   * Set when the API and the front end are on different sites (not just
   * different ports). The session cookie then needs SameSite=None, which
   * browsers only accept over HTTPS.
   */
  crossSite: process.env.COOKIE_CROSS_SITE === 'true',

  webhook: {
    endpoint: process.env.WEBHOOK_ENDPOINT?.trim() || '',
    secret: process.env.WEBHOOK_SECRET?.trim() || '',
  },
}

export const SESSION_COOKIE = 'billing_session'

/**
 * Cookie options for the session.
 *
 * httpOnly so a script cannot read the token; secure in production so it never
 * crosses plain HTTP. SameSite is the interesting one: 'lax' is right when the
 * API and the app share a site, but a front end on a different domain needs
 * 'none', and that requires HTTPS on both ends.
 */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProduction || config.crossSite,
    sameSite: config.crossSite ? ('none' as const) : ('lax' as const),
    maxAge: config.sessionMaxAgeSeconds * 1000,
    path: '/',
  }
}
