'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/database.types'

function readEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error(
      'Missing Supabase env vars. Add NEXT_PUBLIC_SUPABASE_URL and ' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local, then restart `npm run dev`.',
    )
  }

  return { url, anonKey }
}

// One instance per browser tab. createBrowserClient already memoizes internally,
// but holding the reference here keeps auth state stable across Fast Refresh.
let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined

export function createClient() {
  if (!browserClient) {
    const { url, anonKey } = readEnv()
    browserClient = createBrowserClient<Database>(url, anonKey)
  }
  return browserClient
}

