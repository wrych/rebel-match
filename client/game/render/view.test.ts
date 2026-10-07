import { describe, expect, it } from 'vitest'
import { gameDefaults } from '../../../src/game/tuning'
import { startDay } from '../core/state'
import {
  clockText,
  follow,
  greyAt,
  markers,
  TILES_TALL,
  toFloor,
  trouble,
} from './view'

const { enabled: _enabled, ...tuning } = gameDefaults

describe('the view (R-GAME-12)', () => {
  it('follows the player, kept inside the floor', () => {
    const floor = { width: 35, height: 16 }

    expect(follow({ x: 17, y: 8 }, floor, 2)).toEqual({
      x: 17 - TILES_TALL,
      y: 8 - TILES_TALL / 2,
      width: TILES_TALL * 2,
      height: TILES_TALL,
    })
    expect(follow({ x: 0, y: 0 }, floor, 2)).toMatchObject({ x: 0, y: 0 })
    expect(follow({ x: 35, y: 16 }, floor, 2)).toMatchObject({
      x: 35 - TILES_TALL * 2,
      y: 16 - TILES_TALL,
    })
  })

  it('centres a floor smaller than the screen', () => {
    expect(follow({ x: 1, y: 1 }, { width: 10, height: 20 }, 3).x).toBe(
      (10 - TILES_TALL * 3) / 2,
    )
  })

  it('points at trouble out of view, from the edge', () => {
    const day = startDay(13, tuning, 1)
    const view = { x: 0, y: 0, width: 4, height: 4 }
    for (const employee of day.employees) employee.spirit = 'grey'
    const far = day.employees[0]
    if (far === undefined) throw new Error('no employee')
    far.position = { x: 30, y: 2 }
    far.spirit = 'tempted'

    const shown = markers(day, view)

    expect(shown).toHaveLength(1)
    expect(shown[0]?.at.x).toBeLessThanOrEqual(4)
    expect(shown[0]?.angle).toBeCloseTo(0, 0)
  })

  it('counts grey and heat as trouble in rebel mode, and rebels in boss mode', () => {
    const boss = startDay(1, tuning, 1)
    const rebel = startDay(16, tuning, 1)
    const someone = { ...boss.employees[0], spirit: 'rebel' } as never

    expect(trouble(boss, someone)).toBe(true)
    expect(trouble(rebel, someone)).toBe(false)
    expect(trouble(rebel, { ...(someone as object), heat: 1 } as never)).toBe(
      true,
    )
  })

  it('reads the clock from 09:00 to 17:00', () => {
    expect(clockText(0, 90)).toBe('09:00')
    expect(clockText(45, 90)).toBe('13:00')
    expect(clockText(90, 90)).toBe('17:00')
  })

  it('finds the grey employee a tap lands on (R-GAME-11)', () => {
    const day = startDay(16, tuning, 1)
    const grey = day.employees[0]
    if (grey === undefined) throw new Error('no employee')
    grey.spirit = 'grey'
    grey.position = { x: 10, y: 5 }
    grey.doing = { kind: 'atDesk' }
    const at = toFloor({ x: 8, y: 4, width: 10, height: 5 }, 40, {
      x: 80,
      y: 40,
    })

    expect(at).toEqual({ x: 10, y: 5 })
    expect(greyAt(day, at)?.id).toBe(grey.id)
    expect(greyAt(day, { x: 20, y: 20 })).toBeUndefined()
  })
})
