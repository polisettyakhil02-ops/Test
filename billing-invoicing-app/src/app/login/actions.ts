'use server'

import { AuthError } from 'next-auth'
import { signIn } from '@/auth'

export interface LoginState {
  error: string | null
}

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get('email') || '').trim()
  const password = String(formData.get('password') || '')
  const callbackUrl = String(formData.get('callbackUrl') || '/dashboard')

  if (!email || !password) {
    return { error: 'Enter both your email and password.' }
  }

  // Only allow same-origin relative paths, so a crafted ?callbackUrl= can't
  // turn the login form into an open redirect.
  const redirectTo =
    callbackUrl.startsWith('/') && !callbackUrl.startsWith('//')
      ? callbackUrl
      : '/dashboard'

  try {
    await signIn('credentials', { email, password, redirectTo })
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return { error: 'Invalid email or password.' }
        default:
          return { error: 'Could not sign you in. Please try again.' }
      }
    }

    // A successful signIn throws NEXT_REDIRECT, which is not an AuthError and
    // must be rethrown for the redirect to actually happen.
    throw error
  }

  return { error: null }
}
