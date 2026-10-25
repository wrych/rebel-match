import { describe, expect, it } from 'vitest'
import { localInputOf, minutesOf } from './moment'

describe('moment settings (R-RECAP-8)', () => {
  it('reads a field in the reader’s time zone and back', () => {
    const minutes = minutesOf('2026-11-08T17:30')

    expect(minutes).toBe(new Date(2026, 10, 8, 17, 30).getTime() / 60_000)
    expect(localInputOf(minutes ?? 0)).toBe('2026-11-08T17:30')
  })

  it('takes an empty field as none, and none as an empty field', () => {
    expect(minutesOf('  ')).toBe(0)
    expect(localInputOf(0)).toBe('')
  })

  it('refuses what is not a moment', () => {
    expect(minutesOf('soon')).toBeNull()
  })
})
