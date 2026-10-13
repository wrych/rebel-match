import { describe, expect, it } from 'vitest'
import { gameDefaults } from '../../src/game/tuning'
import { PROMOTION_BUTTONS, promotionDue } from './promotion'

const { enabled: _enabled, ...tuning } = gameDefaults

describe('promotionDue (R-GAME-18)', () => {
  it('announces a new job on its first day with what changed, as an HR memo', () => {
    expect(promotionDue(4, 4, tuning, 0)).toEqual({
      job: 'manager',
      lines: [
        'Headcount 4 → 8. More people to keep busy.',
        'Water cooler installed. A new hotbed of unrest.',
        'Meeting room unlocked: 2 seats. Align them before they align themselves.',
      ],
      button: PROMOTION_BUTTONS[0],
    })
  })

  it('lists only what changed', () => {
    const same = { ...tuning, 'director.coolers': tuning['manager.coolers'] }

    expect(promotionDue(7, 7, same, 0)?.lines).toEqual([
      'Headcount 8 → 14. More people to keep busy.',
      'Meeting seats 2 → 3. Room for one more on the agenda.',
    ])
  })

  it('says fewer where a host tuned a number down', () => {
    const fewer = { ...tuning, 'director.employees': 6 }

    expect(promotionDue(7, 7, fewer, 0)?.lines[0]).toBe(
      'Headcount 8 → 6. Fewer people to keep busy.',
    )
  })

  it('picks the button from the day’s seed', () => {
    const buttons = new Set(
      PROMOTION_BUTTONS.map(
        (_, seed) => promotionDue(4, 4, tuning, seed)?.button,
      ),
    )

    expect(buttons.size).toBe(PROMOTION_BUTTONS.length)
  })

  it.each([
    ['the first job', 1, 1],
    ['a later day of the job', 5, 5],
    ['a job already got past', 4, 7],
    ['rebel mode', 16, 16],
  ])('announces nothing on %s', (_case, level, highest) => {
    expect(promotionDue(level, highest, tuning, 0)).toBeNull()
  })
})
