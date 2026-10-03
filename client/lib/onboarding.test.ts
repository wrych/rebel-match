import { describe, expect, it } from 'vitest'
import { afterOnboarding } from './onboarding'

describe('afterOnboarding', () => {
  it.each([
    [null, '/welcome'],
    ['/matches', '/matches'],
    ['/challenges/42?tab=notes', '/challenges/42?tab=notes'],
    ['/onboarding', '/welcome'],
    ['/onboarding?next=%2Fmatches', '/welcome'],
    ['https://evil.example', '/welcome'],
    ['//evil.example', '/welcome'],
    ['/nowhere', '/welcome'],
  ])('sends %s on to %s (R-NAV-6,7)', (next, expected) => {
    expect(afterOnboarding(next)).toBe(expected)
  })
})
