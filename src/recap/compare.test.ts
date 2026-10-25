import { describe, expect, it } from 'vitest'
import { shareBelow } from './compare.js'

const rule = { step: 5, minMembers: 20 }

describe('shareBelow (R-RECAP-3)', () => {
  it('counts the members below, the silent zero counts among them', () => {
    const counts = [1, 1, 2, 5, 9]

    expect(shareBelow(5, counts, 100, rule)).toBe(95)
    expect(shareBelow(2, counts, 100, rule)).toBe(95)
    expect(shareBelow(1, counts, 100, rule)).toBe(95)
  })

  it('rounds down to the step, never up past the truth', () => {
    const counts = Array.from({ length: 13 }, () => 3)

    expect(shareBelow(3, counts, 40, rule)).toBe(65)
  })

  it('says nothing while too few members are active', () => {
    expect(shareBelow(5, [5], 19, rule)).toBeNull()
  })

  it('says nothing for nothing done, or with nobody below', () => {
    expect(shareBelow(0, [3], 100, rule)).toBeNull()
    const everyone = Array.from({ length: 30 }, () => 4)
    expect(shareBelow(4, everyone, 30, rule)).toBeNull()
  })

  it('counts the member themselves even when their count is not listed', () => {
    expect(shareBelow(2, [], 20, rule)).toBe(95)
  })
})
