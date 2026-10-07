import { describe, expect, it } from 'vitest'
import { scrollFor } from './scroll'

describe('scrollFor', () => {
  it('opens a new screen at its top', () => {
    expect(scrollFor('/onboarding/usage', '/onboarding/privacy', null)).toEqual(
      { left: 0, top: 0 },
    )
  })

  it('returns to where the member was on back or forward', () => {
    expect(
      scrollFor('/onboarding', '/onboarding/privacy', { left: 0, top: 320 }),
    ).toEqual({ left: 0, top: 320 })
  })

  it('leaves the page where it is when only the query changed', () => {
    expect(
      scrollFor('/challenges/1/matches', '/challenges/1/matches', null),
    ).toBe(false)
  })
})
