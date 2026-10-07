import { describe, expect, it } from 'vitest'
import { greyOf, lookOf, palette } from './palette'

describe('palette (R-GAME-18)', () => {
  it('takes rebel colours from the happy-mode tokens, with a fallback', () => {
    const pal = palette((token) => (token === '--accent' ? ' #123456 ' : ''))

    expect(pal.rebel[0]).toBe('#123456')
    expect(pal.rebel).toHaveLength(4)
  })

  it('drains a colour to the grey of its own lightness', () => {
    expect(greyOf('#ffffff')).toBe('#ffffff')
    expect(greyOf('#000000')).toBe('#000000')
    expect(greyOf('#ff0000')).toBe('#4c4c4c')
  })

  it('gives each person the same look every day, and a range of skin tones', () => {
    expect(lookOf(3)).toEqual(lookOf(3))
    const tones = new Set(
      Array.from({ length: 12 }, (_, id) => lookOf(id).skin),
    )
    expect(tones.size).toBeGreaterThan(4)
  })
})
