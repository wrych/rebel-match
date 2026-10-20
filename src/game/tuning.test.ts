import { describe, expect, it } from 'vitest'
import { gameBounds, gameDefaults, gameOrder, type GameKey } from './tuning.js'

const keys = Object.keys(gameDefaults) as GameKey[]

describe('game tuning', () => {
  it.each(keys)(
    'starts %s within the bounds hosts may set (R-GAME-17)',
    (key) => {
      const { min, max } = gameBounds[key]

      expect(gameDefaults[key]).toBeGreaterThanOrEqual(min)
      expect(gameDefaults[key]).toBeLessThanOrEqual(max)
    },
  )

  it('starts every ordered pair in order', () => {
    for (const [floor, ceiling] of gameOrder)
      expect(gameDefaults[floor]).toBeLessThanOrEqual(gameDefaults[ceiling])
  })

  it('bounds exactly the numbers it starts from', () => {
    expect(Object.keys(gameBounds).sort()).toEqual([...keys].sort())
  })
})
