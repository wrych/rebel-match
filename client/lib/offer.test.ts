import { describe, expect, it } from 'vitest'
import type { DeckCard } from './deck'
import { noticeFor } from './offer'

const card: DeckCard = {
  challengeId: 'c1',
  body: 'Two shifts, two cultures.',
  trend: { id: '02', short: 'Network of Teams' },
  author: { name: 'Ola Nyberg', jobTitle: null, org: null, sector: null },
}

describe('noticeFor', () => {
  it('says a same-boat request went out, and that nothing is shared yet', () => {
    expect(
      noticeFor(card, 'same_boat', { result: 'recorded', request: 'created' }),
    ).toBe(
      'We let Ola know you are in the same boat. Nothing is shared until they accept.',
    )
  })

  it('says when the member already asked (R-CONN-5)', () => {
    expect(
      noticeFor(card, 'same_boat', { result: 'recorded', request: 'exists' }),
    ).toContain('You already asked Ola')
  })

  it('confirms a follow by the trend', () => {
    expect(noticeFor(card, 'follow', { result: 'recorded' })).toBe(
      'Following “Network of Teams”.',
    )
  })

  it('says nothing for a skip', () => {
    expect(noticeFor(card, 'skip', { result: 'recorded' })).toBeNull()
  })

  it('says when the card closed meanwhile', () => {
    expect(noticeFor(card, 'skip', { result: 'gone' })).toBe(
      'That challenge is no longer open.',
    )
  })
})
