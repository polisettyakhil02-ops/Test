'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

export function SearchInput({ placeholder }: { placeholder: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  // The query string as a string, not as the object: a value that can be
  // compared and used as an effect dependency without changing identity on
  // every render.
  const current = searchParams.toString()
  const [value, setValue] = useState(searchParams.get('q') ?? '')

  useEffect(() => {
    const timeout = setTimeout(() => {
      const params = new URLSearchParams(current)

      if (value) {
        params.set('q', value)
      } else {
        params.delete('q')
      }

      // A new search means a new result set, so page 3 of the old one is
      // meaningless -- and usually empty, which reads as "no results".
      params.delete('page')

      const next = params.toString()

      // Replacing the URL we are already on still counts as a navigation: it
      // re-renders, hands back a fresh searchParams, and runs this effect
      // again -- forever. Comparing first is what stops that, and it also
      // makes the mount case a no-op without needing a first-render flag.
      if (next === current) return

      router.replace(next ? `${pathname}?${next}` : pathname)
    }, 300)

    return () => clearTimeout(timeout)
  }, [value, current, pathname, router])

  return (
    <div className="relative w-full max-w-xs">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <Input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pl-9"
      />
    </div>
  )
}
