// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  afterOnboarding,
  forgetTyped,
  keepTyped,
  stepPath,
  typedProfile,
} from './onboarding'

const ada = {
  name: 'Ada',
  jobTitle: 'Coach',
  org: '',
  sector: 'retail',
  companySize: '',
}

afterEach(() => {
  forgetTyped()
  vi.restoreAllMocks()
})

describe('afterOnboarding', () => {
  it.each([
    [null, '/welcome'],
    ['/matches', '/matches'],
    ['/challenges/42?tab=notes', '/challenges/42?tab=notes'],
    ['/onboarding', '/welcome'],
    ['/onboarding?next=%2Fmatches', '/welcome'],
    ['/onboarding/privacy', '/welcome'],
    ['/onboarding/usage?next=%2Fmatches', '/welcome'],
    ['https://evil.example', '/welcome'],
    ['//evil.example', '/welcome'],
    ['/nowhere', '/welcome'],
  ])('sends %s on to %s (R-NAV-6,7)', (next, expected) => {
    expect(afterOnboarding(next)).toBe(expected)
  })
})

describe('the typed profile (R-ONB-7)', () => {
  it('is kept for the tab and dropped once stored', () => {
    expect(typedProfile()).toBeNull()

    keepTyped(ada)
    expect(typedProfile()).toEqual(ada)
    expect(sessionStorage.getItem('rm_onboarding_profile')).toContain('Ada')

    forgetTyped()
    expect(typedProfile()).toBeNull()
    expect(sessionStorage.getItem('rm_onboarding_profile')).toBeNull()
  })

  it('outlives a reload through session storage', () => {
    sessionStorage.setItem(
      'rm_onboarding_profile',
      JSON.stringify({ name: 'Ada', jobTitle: 7 }),
    )

    expect(typedProfile()).toEqual({
      name: 'Ada',
      jobTitle: '',
      org: '',
      sector: '',
      companySize: '',
    })
  })

  it.each(['not json', 'null', '{"name":"  "}', '{"org":"Rebels"}'])(
    'reads %s as nothing typed',
    (stored) => {
      sessionStorage.setItem('rm_onboarding_profile', stored)
      expect(typedProfile()).toBeNull()
    },
  )

  it('still reaches the next step when the browser refuses storage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('refused')
    })

    keepTyped(ada)

    expect(typedProfile()).toEqual(ada)
  })
})

describe('stepPath', () => {
  it('carries next on to the step (R-NAV-7)', () => {
    expect(stepPath('/onboarding/usage', '/matches')).toBe(
      '/onboarding/usage?next=%2Fmatches',
    )
    expect(stepPath('/onboarding/usage', null)).toBe('/onboarding/usage')
  })
})
