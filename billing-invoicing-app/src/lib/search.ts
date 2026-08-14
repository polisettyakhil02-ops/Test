/**
 * Builds a case-insensitive "contains" regex from user input.
 *
 * The escape matters: a raw `q` of "(" or "*" would otherwise throw a regex
 * syntax error inside MongoDB and 500 the page, and patterns like "(a+)+" are
 * a denial-of-service vector.
 */
export function containsRegex(query: string): RegExp {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(escaped, 'i')
}

/** Normalizes a `?q=` search param into a trimmed string. */
export function readQuery(value: string | string[] | undefined): string {
  if (typeof value === 'string') {
    return value.trim()
  }
  return ''
}
