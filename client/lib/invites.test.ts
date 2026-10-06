import { describe, expect, it } from 'vitest'
import { parseDay } from './invites'

describe('parseDay', () => {
  it('reads YYYY-MM-DD as the start of that local day', () => {
    expect(parseDay('2026-10-06')).toEqual(new Date(2026, 9, 6))
  })

  it('reads a bare day as an end at the next midnight, so the day counts', () => {
    expect(parseDay('2026-12-31', true)).toEqual(new Date(2027, 0, 1))
  })

  it('keeps a given time as it is, start or end', () => {
    expect(parseDay('2026-11-08 09:00')).toEqual(new Date(2026, 10, 8, 9, 0))
    expect(parseDay('2026-11-08 21:30', true)).toEqual(
      new Date(2026, 10, 8, 21, 30),
    )
  })

  it.each([
    '08.11.2026',
    '2026-11-8',
    '2026-02-30',
    '2026-13-01',
    '2026-11-08 24:00',
    '',
  ])('refuses %j', (text) => {
    expect(parseDay(text)).toBeNull()
  })
})
