import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { authConfig } from '@/auth.config'
import { getDb } from '@/db'

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

        const store = await getDb()
        const user = await store.users.findOne({ email: email.toLowerCase() })

        // Compare against a dummy hash when the user does not exist, so a
        // missing account and a wrong password take the same time to answer.
        const hash = user?.passwordHash ?? '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin'
        const matches = await bcrypt.compare(password, hash)

        if (!user || !user.isActive || !matches) return null

        // Returning null for every failure means the form cannot tell "no such
        // account" from "wrong password" -- don't leak which.
        return {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        }
      },
    }),
  ],
})

