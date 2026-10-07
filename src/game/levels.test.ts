import { describe, expect, it } from 'vitest'
import {
  firstDayOf,
  firstDaysUpTo,
  jobOf,
  newProgress,
  plausible,
  progressAfter,
  type Progress,
} from './levels.js'

describe('levels (R-GAME-3, R-GAME-7, R-GAME-16)', () => {
  it('plays three days per boss job, then Rebel for good', () => {
    expect([1, 3, 4, 7, 10, 13, 15, 16, 40].map(jobOf)).toEqual([
      'teamLead',
      'teamLead',
      'manager',
      'director',
      'vp',
      'ceo',
      'ceo',
      'rebel',
      'rebel',
    ])
  })

  it('sends a level back to the first day of its job', () => {
    expect([1, 2, 3, 5, 15, 16, 23].map(firstDayOf)).toEqual([
      1, 1, 1, 4, 13, 16, 16,
    ])
  })

  it('offers the first day of every job reached', () => {
    expect(firstDaysUpTo(1)).toEqual([1])
    expect(firstDaysUpTo(8)).toEqual([1, 4, 7])
    expect(firstDaysUpTo(30)).toEqual([1, 4, 7, 10, 13, 16])
  })
})

describe('plausible (R-GAME-20)', () => {
  const reached: Progress = { ...newProgress, highestLevel: 4 }

  it('accepts a level reached or one past it, in a time a day can take', () => {
    expect(
      plausible(reached, { level: 5, outcome: 'won', playSeconds: 90 }, 240),
    ).toBe(true)
    expect(
      plausible(reached, { level: 1, outcome: 'lost', playSeconds: 240 }, 240),
    ).toBe(true)
  })

  it.each([
    { level: 6, playSeconds: 90 },
    { level: 0, playSeconds: 90 },
    { level: 2, playSeconds: 0 },
    { level: 2, playSeconds: 241 },
    { level: 2.5, playSeconds: 90 },
  ])('refuses level $level after $playSeconds seconds', (day) => {
    expect(plausible(reached, { ...day, outcome: 'won' }, 240)).toBe(false)
  })
})

describe('progressAfter (R-GAME-7, R-GAME-16)', () => {
  it('moves on after a win and keeps the total when a best is first won', () => {
    const after = progressAfter(newProgress, {
      level: 1,
      outcome: 'won',
      playSeconds: 80,
    })

    expect(after).toEqual({
      currentLevel: 2,
      highestLevel: 2,
      bestLevel: 1,
      bestSeconds: 80,
      totalSeconds: 80,
    })
  })

  it('sends a loss or an abandoned day back to the first day of its job, counting its time', () => {
    const playing: Progress = {
      currentLevel: 5,
      highestLevel: 5,
      bestLevel: 4,
      bestSeconds: 400,
      totalSeconds: 500,
    }

    for (const outcome of ['lost', 'abandoned'] as const)
      expect(
        progressAfter(playing, { level: 5, outcome, playSeconds: 30 }),
      ).toEqual({ ...playing, currentLevel: 4, totalSeconds: 530 })
  })

  it('never changes the best when an easier level is replayed', () => {
    const playing: Progress = {
      currentLevel: 1,
      highestLevel: 8,
      bestLevel: 7,
      bestSeconds: 700,
      totalSeconds: 900,
    }

    expect(
      progressAfter(playing, { level: 1, outcome: 'won', playSeconds: 60 }),
    ).toEqual({ ...playing, currentLevel: 2, totalSeconds: 960 })
  })
})
