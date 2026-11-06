import { describe, expect, it } from 'vitest'
import type { AnalyticsEvent } from './analytics.js'
import {
  createMemberSearch,
  type CardFacts,
  type MemberCard,
  type MemberSearchService,
  type SearchRules,
  type SearchTerms,
} from './member-search.js'

const card = (memberId: string): MemberCard => ({
  memberId,
  name: `Member ${memberId}`,
  jobTitle: null,
  org: null,
  sector: null,
  companySize: null,
})

const rules: SearchRules = { searchOn: true, minChars: 2, maxResults: 2 }

function setup(options: {
  found?: MemberCard[]
  facts?: CardFacts | null
  rules?: Partial<SearchRules>
}): {
  service: MemberSearchService
  asked: { terms: SearchTerms; limit: number }[]
  events: AnalyticsEvent[]
} {
  const asked: { terms: SearchTerms; limit: number }[] = []
  const events: AnalyticsEvent[] = []
  const service = createMemberSearch({
    rules: () => ({ ...rules, ...options.rules }),
    track: (_memberId, event) => {
      events.push(event)
      return Promise.resolve()
    },
    store: {
      search: (_callerId, terms, limit) => {
        asked.push({ terms, limit })
        return Promise.resolve(options.found ?? [])
      },
      card: () => Promise.resolve(options.facts ?? null),
    },
  })
  return { service, asked, events }
}

describe('member search (R-FIND-2, R-FIND-3)', () => {
  it('searches plain words as the name, each field by its operator', async () => {
    const { service, asked } = setup({})

    await service.search('me', 'Zoë org:"Corporate Rebels" title:coach*')

    expect(asked[0]?.terms).toEqual({
      name: ['zoe'],
      company: ['corporate rebels'],
      title: ['coach'],
      sector: [],
    })
  })

  it('splits a term into words as the fields are split', async () => {
    const { service, asked } = setup({})

    await service.search('me', 'jean-luc sector:financial-services')

    expect(asked[0]?.terms.name).toEqual(['jean luc'])
    expect(asked[0]?.terms.sector).toEqual(['financial services'])
  })

  it('searches nothing when no term is long enough, and says so', async () => {
    const { service, asked, events } = setup({})

    expect(await service.search('me', 'a company:- *')).toEqual({
      results: [],
      more: false,
      tooShort: true,
    })
    expect(asked).toEqual([])
    expect(events).toEqual([])
  })

  it('needs no name: one field alone is a query', async () => {
    const { service, asked } = setup({ found: [card('a')] })

    const answer = await service.search('me', 'company:acme')

    expect(answer).toEqual({ results: [card('a')], more: false })
    expect(asked).toHaveLength(1)
  })

  it('asks for one more than it shows, and says only that more match', async () => {
    const found = [card('a'), card('b'), card('c')]
    const { service, asked } = setup({ found })

    const answer = await service.search('me', 'ada')

    expect(asked[0]?.limit).toBe(3)
    expect(answer).toEqual({ results: [card('a'), card('b')], more: true })
  })
})

describe('the member_searched event (R-FIND-8)', () => {
  it.each([
    [[], 'none'],
    [[card('a')], 'some'],
    [[card('a'), card('b'), card('c')], 'more'],
  ] as const)('reports %j as %s results', async (found, results) => {
    const { service, events } = setup({ found: [...found] })

    await service.search('me', 'ada')

    expect(events).toEqual([
      { name: 'member_searched', operators: [], results },
    ])
  })

  it('names each operator used once, and never the query', async () => {
    const { service, events } = setup({})

    await service.search('me', 'ada org:acme company:rebels title:coach x:y')

    expect(events).toEqual([
      {
        name: 'member_searched',
        operators: ['company', 'title'],
        results: 'none',
      },
    ])
    expect(JSON.stringify(events)).not.toMatch(/ada|acme|coach/)
  })
})

describe("a member's card (R-FIND-6)", () => {
  const open: CardFacts = { card: card('b'), reachable: true, findable: true }

  it('shows a card search would find', async () => {
    const { service } = setup({ facts: open })

    expect(await service.card('a', 'b')).toEqual(card('b'))
  })

  it.each([
    ['no such member', null, {}],
    ['a member who is not active', { ...open, reachable: false }, {}],
    ['a member who turned findable off', { ...open, findable: false }, {}],
    ['anyone while search is off', open, { searchOn: false }],
  ] as const)('is not found for %s', async (_who, facts, change) => {
    const { service } = setup({ facts, rules: change })

    expect(await service.card('a', 'b')).toBeNull()
  })

  it('is not found for the caller themselves', async () => {
    const { service } = setup({ facts: open })

    expect(await service.card('b', 'b')).toBeNull()
  })
})
