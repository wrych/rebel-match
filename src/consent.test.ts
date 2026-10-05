import { describe, expect, it } from 'vitest'
import { consentWordsOf, latestConsentVersion } from './consent.js'

describe('consent wording', () => {
  const words = consentWordsOf(latestConsentVersion).join(' ')

  it('has words for the latest version', () => {
    expect(words.length).toBeGreaterThan(0)
  })

  it('says emails are shared only when both sides connect (R-ONB-5)', () => {
    expect(words).toContain('only when both of you accept a connection')
  })

  it('says other members may see the profile (R-ONB-5)', () => {
    expect(words).toContain(
      'name, organization and other profile information may be seen by other members',
    )
  })

  it('says activity is recorded, kept with the account and deletable (R-STAT-5)', () => {
    expect(words).toContain('We record your activity in the app')
    expect(words).toContain('keep it as long as your account exists')
    expect(words).toContain('figures that combine many members’ activity')
    expect(words).toContain('only where a feature needs it')
    expect(words).toContain('You can delete your activity history at any time')
  })

  it('leaves the words of earlier versions as they were accepted (R-ONB-4)', () => {
    expect(consentWordsOf('2026-11-01.2').join(' ')).not.toContain(
      'We record your activity',
    )
  })

  it('says membership is by invitation (R-ONB-5)', () => {
    expect(words).toContain('membership is by invitation')
  })

  it.each(['constructor', 'toString', 'unknown'])(
    'has no words for %s',
    (version) => {
      expect(consentWordsOf(version)).toEqual([])
    },
  )
})
