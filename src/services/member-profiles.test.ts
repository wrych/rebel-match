import { describe, expect, it } from 'vitest'
import { isOnboarded } from './member-profiles.js'

describe('isOnboarded', () => {
  const at = new Date('2026-11-08T10:00:00Z')

  it('needs both a name and recorded consent (R-ONB-1)', () => {
    expect(isOnboarded({ name: 'Ada', consentAt: at })).toBe(true)
    expect(isOnboarded({ name: 'Ada', consentAt: null })).toBe(false)
    expect(isOnboarded({ name: null, consentAt: at })).toBe(false)
  })
})
