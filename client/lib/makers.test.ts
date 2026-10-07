import { describe, expect, it } from 'vitest'
import { initials, makers } from './makers'

describe('initials', () => {
  it.each([
    ['Pascal Dulex', 'PD'],
    ['Ivo', 'I'],
    ['  andy   moesch ', 'AM'],
  ])('reads %j as %s', (name, expected) => {
    expect(initials(name)).toBe(expected)
  })
})

describe('makers', () => {
  it('names what each maker is responsible for (R-PROF-4)', () => {
    for (const maker of makers) {
      expect(maker.name).not.toBe('')
      expect(maker.responsibilities.length).toBeGreaterThan(0)
    }
  })
})
