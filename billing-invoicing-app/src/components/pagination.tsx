import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Page links, rendered on the server.
 *
 * They are real links carrying the current filters, so a page can be
 * bookmarked, opened in a new tab and read by a crawler-shaped thing — which a
 * button that calls router.push cannot.
 */
export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  basePath,
  params,
  noun,
}: {
  page: number
  pageCount: number
  total: number
  pageSize: number
  basePath: string
  params: Record<string, string>
  noun: string
}) {
  if (total === 0) return null

  const href = (target: number) => {
    const search = new URLSearchParams(params)
    if (target > 1) {
      search.set('page', String(target))
    } else {
      search.delete('page')
    }
    const query = search.toString()
    return query ? `${basePath}?${query}` : basePath
  }

  const first = (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3">
      <p className="text-muted-foreground text-sm">
        {first}–{last} of {total} {noun}
      </p>

      {pageCount > 1 ? (
        <div className="flex items-center gap-1">
          <PageLink href={href(page - 1)} disabled={page <= 1} label="Previous page">
            <ChevronLeft className="size-4" />
          </PageLink>

          {pageNumbers(page, pageCount).map((entry, index) =>
            entry === null ? (
              <span key={`gap-${index}`} className="text-muted-foreground px-1 text-sm">
                …
              </span>
            ) : (
              <Link
                key={entry}
                href={href(entry)}
                aria-current={entry === page ? 'page' : undefined}
                className={cn(
                  'flex size-8 items-center justify-center rounded-md text-sm font-medium transition-colors',
                  entry === page
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                {entry}
              </Link>
            ),
          )}

          <PageLink href={href(page + 1)} disabled={page >= pageCount} label="Next page">
            <ChevronRight className="size-4" />
          </PageLink>
        </div>
      ) : null}
    </div>
  )
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string
  disabled: boolean
  label: string
  children: React.ReactNode
}) {
  if (disabled) {
    return (
      <span
        aria-disabled
        aria-label={label}
        className="text-muted-foreground/40 flex size-8 items-center justify-center rounded-md"
      >
        {children}
      </span>
    )
  }

  return (
    <Link
      href={href}
      aria-label={label}
      className="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex size-8 items-center justify-center rounded-md transition-colors"
    >
      {children}
    </Link>
  )
}

/** First, last, and a window around the current page; `null` is an ellipsis. */
export function pageNumbers(page: number, pageCount: number): Array<number | null> {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1)
  }

  const window = new Set<number>([1, pageCount, page])
  for (const offset of [-1, 1]) {
    const near = page + offset
    if (near > 1 && near < pageCount) window.add(near)
  }

  const sorted = [...window].sort((a, b) => a - b)
  const result: Array<number | null> = []

  for (const [index, value] of sorted.entries()) {
    if (index > 0 && value - sorted[index - 1] > 1) result.push(null)
    result.push(value)
  }

  return result
}
