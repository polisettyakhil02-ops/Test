import type { DefaultSession } from 'next-auth'

type UserRole = 'admin' | 'accountant' | 'viewer'

// `next-auth` and `next-auth/jwt` are thin `export *` re-exports of
// `@auth/core/*`, and the callback signatures in @auth/core reference the
// original interfaces. Augmenting the @auth/core modules is what actually
// merges; augmenting only the `next-auth` aliases leaves `token.id` as
// `unknown`, which then silently widens everywhere it is used.

declare module '@auth/core/types' {
  interface Session {
    user: {
      id: string
      role: UserRole
    } & DefaultSession['user']
  }

  interface User {
    role: UserRole
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    id: string
    role: UserRole
  }
}
