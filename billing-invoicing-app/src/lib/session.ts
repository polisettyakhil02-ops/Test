import { cache } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { entities } from '@/db/schema'

export type Role = 'admin' | 'accountant' | 'viewer'

export interface AppSession {
  userId: string
  email: string
  name: string
  role: Role
  entityId: string
  entityName: string
}

/**
 * The signed-in user plus the entity they are working in.
 *
 * `cache` dedupes this per request, so a page and the actions it renders share
 * one lookup rather than hitting the database repeatedly.
 */
export const getAppSession = cache(async (): Promise<AppSession | null> => {
  const session = await auth()
  if (!session?.user?.id) return null

  // Single-tenant: exactly one entity, created by the setup script.
  const [entity] = await db.select().from(entities).limit(1)
  if (!entity) return null

  return {
    userId: session.user.id,
    email: session.user.email ?? '',
    name: session.user.name ?? '',
    role: (session.user.role ?? 'viewer') as Role,
    entityId: entity.id,
    entityName: entity.name,
  }
})

/** For pages and server actions: a session, or a redirect to sign in. */
export async function requireSession(): Promise<AppSession> {
  const session = await getAppSession()
  if (!session) redirect('/login')
  return session
}

const RANK: Record<Role, number> = { viewer: 0, accountant: 1, admin: 2 }

/** True when the role is at least the one required. */
export function can(role: Role, atLeast: Role): boolean {
  return RANK[role] >= RANK[atLeast]
}

export class ForbiddenError extends Error {
  constructor(needed: Role) {
    super(`You need the ${needed} role to do that.`)
    this.name = 'ForbiddenError'
  }
}

/**
 * Server Actions are public HTTP endpoints; rendering inside a protected layout
 * does not protect the action. Every write goes through here.
 */
export async function requireRole(atLeast: Role): Promise<AppSession> {
  const session = await requireSession()
  if (!can(session.role, atLeast)) {
    throw new ForbiddenError(atLeast)
  }
  return session
}

export async function requireEntity() {
  const [entity] = await db.select().from(entities).limit(1)
  if (!entity) {
    throw new Error('No entity configured. Run `npm run setup` first.')
  }
  return entity
}
