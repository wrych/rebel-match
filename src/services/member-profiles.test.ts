import { describe, expect, it } from 'vitest'
import { isOnboarded } from './member-profiles.js'

describe('isOnboarded', () => {
  const at = new Date('2026-11-08T10:00:00Z')
  const current = '2026-11-01'

  it('needs both a name and recorded consent (R-ONB-1)', () => {
    const accepted = { consentVersion: current, consentAt: at }

    expect(isOnboarded({ name: 'Ada', ...accepted }, current)).toBe(true)
    expect(
      isOnboarded(
        { name: 'Ada', consentVersion: null, consentAt: null },
        current,
      ),
    ).toBe(false)
    expect(isOnboarded({ name: null, ...accepted }, current)).toBe(false)
  })

  it('sends back a member whose consent predates the current version (R-ONB-4)', () => {
    expect(
      isOnboarded(
        { name: 'Ada', consentVersion: '2026-01-01', consentAt: at },
        current,
      ),
    ).toBe(false)
  })
})
