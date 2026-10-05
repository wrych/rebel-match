import { describe, expect, it } from 'vitest'
import { day, graceSpan, when } from './when'

describe('when', () => {
  it('reads an instant as day, month and time', () => {
    expect(when('2026-11-08T09:05:00.000Z')).toMatch(
      /^\d{1,2} Nov, \d{2}:\d{2}$/,
    )
  })

  it('leaves something that is not a date as it is', () => {
    expect(when('soon')).toBe('soon')
  })
})

describe('day', () => {
  it('names the day in full', () => {
    expect(day('2026-11-04T10:00:00.000Z')).toBe('4 November 2026')
  })
})

describe('graceSpan', () => {
  it('names the configured wait', () => {
    expect(graceSpan(14)).toBe('14 days')
  })

  it('names no number before the settings are read', () => {
    expect(graceSpan(null)).toBe('the grace period')
  })
})
