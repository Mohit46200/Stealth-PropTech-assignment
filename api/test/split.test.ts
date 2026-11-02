import { describe, expect, it } from 'vitest'
import { splitCents } from '../src/split'

describe('splitCents', () => {
  it.each([
    [1000, 3, [334, 333, 333]],
    [3000, 3, [1000, 1000, 1000]],
    [2, 3, [1, 1, 0]],
    [1, 1, [1]],
    [100001, 7, [14286, 14286, 14286, 14286, 14286, 14286, 14285]],
  ])('splits %i between %i members', (total, count, expected) => {
    expect(splitCents(total, count)).toEqual(expected)
  })

  it('always adds up to the total', () => {
    for (let total = 1; total < 500; total += 7) {
      for (let count = 1; count < 12; count++) {
        const shares = splitCents(total, count)
        expect(shares.reduce((sum, share) => sum + share, 0)).toBe(total)
        expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1)
      }
    }
  })

  it('refuses bad input', () => {
    expect(() => splitCents(10.5, 2)).toThrow(RangeError)
    expect(() => splitCents(100, 0)).toThrow(RangeError)
  })
})
