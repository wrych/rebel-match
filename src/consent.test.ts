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
