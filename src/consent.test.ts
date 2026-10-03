import { describe, expect, it } from 'vitest'
import { consentTexts, latestConsentVersion } from './consent.js'

describe('consent wording', () => {
  const words = (consentTexts[latestConsentVersion] ?? []).join(' ')

  it('has words for the latest version', () => {
    expect(words.length).toBeGreaterThan(0)
  })

  it('says emails are shared only when both sides connect (R-ONB-5)', () => {
    expect(words).toContain('only when both of you accept a connection')
  })

  it('says membership is by invitation (R-ONB-5)', () => {
    expect(words).toContain('membership is by invitation')
  })
})
