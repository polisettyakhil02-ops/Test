import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { z } from 'zod'
import { authConfig } from '@/auth.config'
import { connectToDatabase } from '@/lib/mongodb'
import { User } from '@/models/User'

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

        if (!parsed.success) {
          return null
        }

        const { email, password } = parsed.data

        await connectToDatabase()

        // passwordHash has `select: false` on the schema, so it must be opted in.
        const user = await User.findOne({ email: email.toLowerCase() }).select(
          '+passwordHash',
        )

        if (!user) {
          return null
        }

        const passwordMatches = await user.comparePassword(password)

        if (!passwordMatches) {
          return null
        }

        // Returning null for every failure means the login form cannot tell
        // "no such account" apart from "wrong password" -- don't leak which.
        return {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
        }
      },
    }),
  ],
})
