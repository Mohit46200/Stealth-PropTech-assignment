const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

/** Formats whole cents for display. Money stays an integer everywhere else. */
export function formatCents(cents: number): string {
  return formatter.format(cents / 100)
}

/**
 * Parses what a user types ("12", "12.5", "12.50") into whole cents without floating point
 * math. Returns null for anything that is not a positive amount with at most 2 decimals.
 */
export function parseDollarsToCents(input: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(input.trim())
  if (!match) return null
  const dollars = Number(match[1])
  const cents = Number((match[2] ?? '').padEnd(2, '0'))
  const total = dollars * 100 + cents
  return Number.isSafeInteger(total) && total > 0 ? total : null
}
