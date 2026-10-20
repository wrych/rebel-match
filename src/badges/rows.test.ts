import { describe, expect, it } from 'vitest'
import { countedRows, levelsReached, rowNames } from './rows.js'

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
