import { describe, expect, it } from 'vitest'
import { when } from './when'

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
