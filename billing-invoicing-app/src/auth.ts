import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import { authConfig } from '@/auth.config'
import { db } from '@/db'
import { users } from '@/db/schema'

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials)
        if (!parsed.success) return null

        const { email, password } = parsed.data

        const [user] = await db
          .select()
          .from(users)
          .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
          .limit(1)

        if (!user || !user.isActive) return null

        const matches = await bcrypt.compare(password, user.passwordHash)
        if (!matches) return null

        // Returning null for every failure means the form cannot tell "no such
        // account" from "wrong password" -- don't leak which.
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        }
      },
    }),
  ],
})

