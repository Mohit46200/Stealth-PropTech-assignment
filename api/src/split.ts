/**
 * Splits `totalCents` into `count` whole-cent shares that always add up to the total.
 * The remainder goes one cent at a time to the first shares, so the caller must pass
 * members in the order they joined. Example: splitCents(1000, 3) -> [334, 333, 333].
 */
export function splitCents(totalCents: number, count: number): number[] {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) {
    throw new RangeError('totalCents must be a non-negative whole number')
  }
  if (!Number.isSafeInteger(count) || count <= 0) {
    throw new RangeError('count must be a positive whole number')
  }
  const base = Math.floor(totalCents / count)
  const remainder = totalCents % count
  return Array.from({ length: count }, (_, index) => (index < remainder ? base + 1 : base))
}
