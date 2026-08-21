import type { NextAuthConfig } from 'next-auth'

/**
 * The half of the auth config that carries no database or bcrypt imports.
 *
 * `proxy.ts` runs on every matched request, so it instantiates NextAuth from
 * this file alone -- that is enough to verify and decode the session JWT
 * without opening a MongoDB connection in the request path. The full config in
 * `auth.ts` spreads this and adds the Credentials provider.
 */
export const authConfig = {
  pages: {
    signIn: '/login',
  },
  session: {
    // Credentials sign-in requires JWT sessions; database sessions are not
    // supported for it by Auth.js.
    strategy: 'jwt',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
  callbacks: {
    jwt({ token, user }) {
      // `user` is only present on the request right after a successful sign-in.
      if (user) {
        token.id = user.id as string
        token.role = user.role
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id
        session.user.role = token.role
      }
      return session
    },
  },
  providers: [],
} satisfies NextAuthConfig
