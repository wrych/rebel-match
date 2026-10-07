import { describe, expect, it } from 'vitest'
import { gameDefaults } from '../../src/game/tuning'
import { hintsDue, hintWords } from './hints'

const { enabled: _enabled, ...tuning } = gameDefaults

describe('hints (R-GAME-18)', () => {
  it('brings the first day’s hint, then each mechanic’s the first time it appears', () => {
    expect(hintsDue(1, tuning, [])).toEqual(['firstDay'])
    expect(hintsDue(4, tuning, ['firstDay'])).toEqual(['meeting', 'cooler'])
    expect(hintsDue(16, tuning, ['firstDay', 'meeting', 'cooler'])).toEqual([
      'rebelMode',
    ])
  })

  it('shows nothing twice, and no cooler hint on a floor without coolers', () => {
    expect(
      hintsDue(4, { ...tuning, 'manager.coolers': 0 }, ['firstDay']),
    ).toEqual(['meeting'])
    expect(hintsDue(7, tuning, ['firstDay', 'meeting', 'cooler'])).toEqual([])
  })

  it('has words for every hint', () => {
    expect(hintWords('rebelMode').title).toBe('You are a rebel now')
  })
})
