import { handlers } from '@/auth'

export const { GET, POST } = handlers

// Auth callbacks touch cookies and MongoDB; never prerender or cache them.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
