/**
 * Offset paging.
 *
 * Kept apart from `queries.ts` so it stays importable without opening a
 * database connection: `@/db` connects at module load, which would make these
 * pure helpers untestable and drag a pool into anything that only wanted to do
 * arithmetic.
 *
 * Offset paging is the right trade for these screens: the lists are sorted by
 * name or date, the user jumps to a page rather than scrolling forever, and the
 * row counts are thousands rather than millions. Keyset paging would buy
 * nothing and cost the page numbers.
 */

export const PAGE_SIZE = 50

export interface Page<T> {
  rows: T[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

/** Turns a 1-based page number into an offset, clamping anything below 1. */
export function pageOffset(page: number, pageSize: number = PAGE_SIZE): number {
  return (Math.max(page, 1) - 1) * pageSize
}

export function paged<T>(rows: T[], total: number, page: number, pageSize: number): Page<T> {
  return {
    rows,
    total,
    page: Math.max(page, 1),
    pageSize,
    // Always at least one page, so an empty list still renders "0 of 0" rather
    // than a control with no pages in it.
    pageCount: Math.max(Math.ceil(total / pageSize), 1),
  }
}
