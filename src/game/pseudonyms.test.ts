import { describe, expect, it } from 'vitest'
import { pickPseudonym } from './pseudonyms.js'

describe('pickPseudonym (R-GAME-15)', () => {
  it('picks an adjective and "Rebel"', () => {
    expect(pickPseudonym(new Set(), () => 0)).toMatch(/^[A-Z][a-z]+ Rebel$/)
  })

  it('never picks one that is taken', () => {
    const first = pickPseudonym(new Set(), () => 0)

    expect(pickPseudonym(new Set([first]), () => 0)).not.toBe(first)
  })

  it('numbers the names once every adjective is taken', () => {
    const taken = new Set<string>()
    for (let i = 0; i < 1000; i += 1) {
      const name = pickPseudonym(taken, () => 0)
      if (name.endsWith(' 2')) break
      taken.add(name)
    }

    expect(pickPseudonym(taken, () => 0)).toMatch(/ Rebel 2$/)
  })
})
