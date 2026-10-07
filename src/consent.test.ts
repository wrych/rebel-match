import { describe, expect, it } from 'vitest'
import {
  consentWordsOf,
  latestConsentVersion,
  type Paragraph,
} from './consent.js'

function textOf(words: readonly Paragraph[]): string {
  return words
    .map((paragraph) =>
      typeof paragraph === 'string'
        ? paragraph
        : `${paragraph.heading}: ${paragraph.text}`,
    )
    .join(' ')
}

describe('consent wording', () => {
  const words = textOf(consentWordsOf(latestConsentVersion))

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

  it('names who is responsible and how to reach them (R-ONB-5)', () => {
    expect(words).toContain(
      'Who is responsible: Transformation Architects GmbH',
    )
    expect(words).toContain('ready@transformation-architects.ch')
  })

  it('says what the member can ask for and do themselves (R-ONB-5)', () => {
    expect(words).toContain('ask for a copy of your data or have it corrected')
    expect(words).toContain(
      'delete your activity history or your account yourself under Profile & privacy',
    )
    expect(words).toContain('full privacy notice')
  })

  it('puts every paragraph of the latest words under a heading (ADR 0041)', () => {
    for (const paragraph of consentWordsOf(latestConsentVersion))
      expect(typeof paragraph).toBe('object')
  })

  it('leaves the words of earlier versions as they were accepted (R-ONB-4)', () => {
    expect(textOf(consentWordsOf('2026-11-01.2'))).not.toContain(
      'We record your activity',
    )
    expect(textOf(consentWordsOf('2026-11-01.3'))).not.toContain(
      'Transformation Architects',
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
