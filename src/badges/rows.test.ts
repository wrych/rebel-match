import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  countedRows,
  levelsReached,
  promotionLevels,
  rowNames,
} from './rows.js'

describe('levelsReached (R-BADGE-1)', () => {
  const counts = [1, 5, 10]

  it('reaches nothing before the first count', () => {
    expect(levelsReached(0, counts)).toEqual([])
  })

  it('reaches each level at its count exactly', () => {
    expect(levelsReached(1, counts)).toEqual([1])
    expect(levelsReached(5, counts)).toEqual([1, 2])
    expect(levelsReached(10, counts)).toEqual([1, 2, 3])
  })

  it('stays at the levels reached between counts and past the last', () => {
    expect(levelsReached(7, counts)).toEqual([1, 2])
    expect(levelsReached(40, counts)).toEqual([1, 2, 3])
  })

  it('follows the counts it is given', () => {
    expect(levelsReached(3, [2, 3, 4])).toEqual([1, 2])
  })
})

describe('rowNames', () => {
  it('names a level for each of three counts in every row', () => {
    for (const row of countedRows) expect(rowNames[row].levels).toHaveLength(3)
  })
})

describe('promotions (R-BADGE-1, R-BADGE-9)', () => {
  it('names a level for each job, reached on its first day', () => {
    expect(rowNames.game.levels).toEqual([
      'Team Lead',
      'Manager',
      'Director',
      'VP',
      'CEO',
      'Rebel',
    ])
    expect(promotionLevels).toEqual([1, 4, 7, 10, 13, 16])
    expect(levelsReached(9, promotionLevels)).toEqual([1, 2, 3])
  })

  it('places them as the quiet backfill of promotions already reached did', () => {
    const migration = readFileSync(
      new URL('../../db/migrations/0021_badge_promotions.sql', import.meta.url),
      'utf8',
    )
    const pairs = [...migration.matchAll(/\((\d+), (\d+)\)/g)].map(
      ([, level, day]) => [Number(level), Number(day)],
    )
    expect(pairs).toEqual(promotionLevels.map((day, index) => [index + 1, day]))
  })
})
