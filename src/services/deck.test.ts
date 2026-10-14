import { describe, expect, it } from 'vitest'
import type { AnalyticsEvent } from './analytics.js'
import { createDeck, type DeckCard } from './deck.js'

const card: DeckCard = {
  challengeId: 'c-bob',
  body: 'Decisions wait for weeks.',
  trend: { id: '06', short: 'DDM' },
  author: {
    name: 'Bob',
    jobTitle: null,
    org: null,
    sector: null,
    companySize: null,
  },
}

describe('createDeck (R-OFF-1, R-ANA-1)', () => {
  it('deals a page, and reports a deck with nothing left to deal', async () => {
    const tracked: [string, AnalyticsEvent][] = []
    const asked: [string, number, string | undefined][] = []
    let left = [card]
    const deck = createDeck({
      pageSize: 7,
      store: {
        nextFor: (viewerId, limit, first) => {
          asked.push([viewerId, limit, first])
          return Promise.resolve(left)
        },
      },
      track: (memberId, event) => {
        tracked.push([memberId, event])
        return Promise.resolve()
      },
    })

    expect(await deck.next('m-ada', 'c-bob')).toEqual([card])
    expect(tracked).toEqual([])
    left = []
    expect(await deck.next('m-ada')).toEqual([])

    expect(asked).toEqual([
      ['m-ada', 7, 'c-bob'],
      ['m-ada', 7, undefined],
    ])
    expect(tracked).toEqual([['m-ada', { name: 'deck_emptied' }]])
  })
})
