import { describe, expect, it } from 'vitest'
import {
  analyticsWordsOf,
  latestAnalyticsVersion,
} from './analytics-consent.js'

describe('analytics wording', () => {
  const words = analyticsWordsOf(latestAnalyticsVersion)
  const headings = words.flatMap((paragraph) =>
    typeof paragraph === 'string' ? [] : [paragraph.heading],
  )
  const text = words
    .map((paragraph) =>
      typeof paragraph === 'string' ? paragraph : paragraph.text,
    )
    .join(' ')

  it('says what is recorded, why, where it goes and what never is (R-ANA-4)', () => {
    expect(headings).toEqual([
      'What is recorded',
      'Why',
      'Where it goes',
      'Never included',
    ])
    expect(text).toContain('Mixpanel, stored in the EU')
  })

  it('says where to change the choice (R-ANA-4)', () => {
    expect(text).toContain('under Profile & privacy, in the menu')
  })

  it('does not speak of a box to tick, so it reads beside two buttons (ADR 0041)', () => {
    expect(text).not.toMatch(/tick/i)
  })

  it('has no words for an unknown version', () => {
    expect(analyticsWordsOf('constructor')).toEqual([])
  })
})
