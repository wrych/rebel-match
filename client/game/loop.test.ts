import { describe, expect, it } from 'vitest'
import { gameDefaults } from '../../src/game/tuning'
import { startDay } from './core/state'
import { advance, STEP_SECONDS } from './loop'

const { enabled: _enabled, ...tuning } = gameDefaults

describe('the loop', () => {
  it('steps in fixed steps, carrying what is left to the next frame', () => {
    const day = startDay(1, tuning, 1)

    const next = advance(day, { move: { x: 0, y: 0 } }, STEP_SECONDS * 2.5, 0)

    expect(next.state.clock).toBeCloseTo(STEP_SECONDS * 2)
    expect(next.carry).toBeCloseTo(STEP_SECONDS / 2)
  })

  it('catches up only so far after a long pause', () => {
    const next = advance(
      startDay(1, tuning, 1),
      { move: { x: 0, y: 0 } },
      60,
      0,
    )

    expect(next.state.clock).toBeLessThan(1)
  })

  it('uses an action once, and says so', () => {
    const day = startDay(1, tuning, 1)

    const quiet = advance(day, { move: { x: 0, y: 0 } }, STEP_SECONDS, 0)
    const acted = advance(
      day,
      { move: { x: 0, y: 0 }, act: 'takeFile' },
      STEP_SECONDS * 3,
      0,
    )

    expect(quiet.acted).toBe(false)
    expect(acted.acted).toBe(true)
    expect(acted.state.player.carrying).toBe(true)
  })
})
