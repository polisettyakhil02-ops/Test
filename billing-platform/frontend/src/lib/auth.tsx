import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, onUnauthorized } from '@/api/client'
import type { Role, User } from '@/api/types'

interface Session {
  user: User
  entity: { id: string; name: string }
}

interface AuthValue {
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  can: (atLeast: Role) => boolean
}

const AuthContext = createContext<AuthValue | null>(null)

const RANK: Record<Role, number> = { viewer: 0, accountant: 1, admin: 2 }

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  // Ask the API who we are on load. The session is an httpOnly cookie, so this
  // is the only way to find out — the browser cannot read it.
  useEffect(() => {
    let cancelled = false
    api
      .get<Session>('/auth/me')
      .then((value) => { if (!cancelled) setSession(value) })
      .catch(() => { if (!cancelled) setSession(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // Any 401 from anywhere drops the session, so an expired cookie shows the
  // login screen rather than a page full of failed requests.
  useEffect(() => onUnauthorized(() => setSession(null)), [])

  const signIn = useCallback(async (email: string, password: string) => {
    await api.post('/auth/login', { email, password })
    setSession(await api.get<Session>('/auth/me'))
  }, [])

  const signOut = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined)
    setSession(null)
  }, [])

  const value = useMemo<AuthValue>(
    () => ({
      session,
      loading,
      signIn,
      signOut,
      can: (atLeast) => (session ? RANK[session.user.role] >= RANK[atLeast] : false),
    }),
    [session, loading, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
