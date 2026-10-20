import { describe, expect, it } from 'vitest'
import { crownAfter, type Standing } from './crowns.js'

const at = (minute: number): Date => new Date(Date.UTC(2026, 10, 8, 10, minute))
const standing = (memberId: string, count: number, minute = 0): Standing => ({
  memberId,
  count,
  reachedAt: at(minute),
})

describe('crownAfter (R-BADGE-3)', () => {
  it('gives the crown to the one member with the highest count', () => {
    expect(crownAfter(null, [standing('ana', 3), standing('ben', 7)], 1)).toBe(
      'ben',
    )
  })

  it('leaves the holder holding it on a tie', () => {
    expect(
      crownAfter('ana', [standing('ana', 5, 9), standing('ben', 5, 1)], 1),
    ).toBe('ana')
  })

  it('moves it once another member passes the holder', () => {
    expect(crownAfter('ana', [standing('ana', 5), standing('ben', 6)], 1)).toBe(
      'ben',
    )
  })

  it('gives a tie without a holder to whoever reached the count first', () => {
    expect(
      crownAfter(null, [standing('ana', 4, 30), standing('ben', 4, 10)], 1),
    ).toBe('ben')
  })

  it('passes it on when the holder has gone from the standings', () => {
    expect(crownAfter('ana', [standing('ben', 2)], 1)).toBe('ben')
  })

  it('gives it to nobody below the first level', () => {
    expect(crownAfter('ana', [standing('ana', 2)], 3)).toBeNull()
    expect(crownAfter(null, [], 1)).toBeNull()
  })
})
