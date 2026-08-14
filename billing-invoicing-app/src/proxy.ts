import NextAuth from 'next-auth'
import { NextResponse } from 'next/server'
import { authConfig } from '@/auth.config'

// NOTE: In Next.js 16 the `middleware` file convention was renamed to `proxy`.
// This file is the direct equivalent of what used to be `middleware.ts` --
// same behavior, current filename. See:
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
//
// Instantiated from `auth.config` (no Mongoose, no bcrypt) so that protecting a
// route stays a JWT signature check and never opens a database connection.
const { auth } = NextAuth(authConfig)

export default auth((req) => {
  const isLoggedIn = Boolean(req.auth)
  const { pathname, search } = req.nextUrl

  const isOnDashboard = pathname === '/dashboard' || pathname.startsWith('/dashboard/')
  const isOnLogin = pathname === '/login'

  if (isOnDashboard && !isLoggedIn) {
    // Remember where they were headed so login can bounce them back.
    const callbackUrl = encodeURIComponent(`${pathname}${search}`)
    return NextResponse.redirect(
      new URL(`/login?callbackUrl=${callbackUrl}`, req.nextUrl.origin),
    )
  }

  if (isOnLogin && isLoggedIn) {
    return NextResponse.redirect(new URL('/dashboard', req.nextUrl.origin))
  }

  return NextResponse.next()
})

export const config = {
  // Skip Next internals, the auth API routes, and static assets. Without this
  // the redirect below would also fire for CSS and JS requests.
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
