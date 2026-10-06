import { describe, expect, it } from 'vitest'
import type { AnalyticsEvent, Track } from './analytics.js'
import { trends as seedTrends } from '../seed/shared/trends.js'
import {
  createChallenges,
  type Challenge,
  type ChallengeStore,
  type PeerCard,
} from './challenges.js'

const stored = seedTrends.map((t) => ({
  id: t.id,
  short: t.short,
  from: t.from,
  peers: t.peers,
  keywords: t.keywords,
}))
const peer: PeerCard = {
  memberId: 'm-marieke',
  name: 'Marieke de Wit',
  jobTitle: 'People lead',
  org: 'Kade Collectief',
  sector: 'Agency & consulting',
  companySize: '51-250',
  note: 'Ran a decision-mapping sprint.',
}

function setup(): {
  service: ReturnType<typeof createChallenges>
  rows: Map<string, Challenge>
  peerCalls: [string, string][]
  newestCalls: [string, string | null, number][]
  tracked: [string, AnalyticsEvent][]
} {
  const tracked: [string, AnalyticsEvent][] = []
  const rows = new Map<string, Challenge>()
  const peerCalls: [string, string][] = []
  const newestCalls: [string, string | null, number][] = []
  const store: ChallengeStore = {
    trends: () => Promise.resolve(stored),
    insert: (c) => {
      rows.set(c.id, {
        ...c,
        trendId: null,
        overridden: false,
        createdAt: '2026-11-08T10:00:00.000Z',
      })
      return Promise.resolve()
    },
    find: (id) => Promise.resolve(rows.get(id) ?? null),
    setTrend: (id, trendId, overridden) => {
      const row = rows.get(id)
      if (row !== undefined) rows.set(id, { ...row, trendId, overridden })
      return Promise.resolve()
    },
    peers: (trendId, viewerId) => {
      peerCalls.push([trendId, viewerId])
      return Promise.resolve({ sameBoat: [peer], beenThere: [peer] })
    },
    cases: () =>
      Promise.resolve([
        { org: 'Advice process', url: 'https://x.invalid', takeaway: 'Ask.' },
      ]),
    newest: (viewerId, trendId, limit) => {
      newestCalls.push([viewerId, trendId, limit])
      return Promise.resolve([
        { body: decide, trend: { id: '06', short: 'Decisions' } },
      ])
    },
  }
  const track: Track = (memberId, event) => {
    tracked.push([memberId, event])
    return Promise.resolve()
  }
  return {
    service: createChallenges({ store, newestShown: 3, track }),
    rows,
    peerCalls,
    newestCalls,
    tracked,
  }
}

const decide = 'Since we flattened, nobody knows who can decide what any more.'

describe('createChallenges', () => {
  it('shows as many newest challenges as configured (R-ASK-14)', async () => {
    const { service, newestCalls } = setup()

    const newest = await service.newest('m-ada', '06')

    expect(newest).toEqual([
      { body: decide, trend: { id: '06', short: 'Decisions' } },
    ])
    expect(newestCalls).toEqual([['m-ada', '06', 3]])
  })

  it('describes a trend with its cases, without keywords (design S9)', async () => {
    const detail = await setup().service.trend('06')

    expect(detail?.trend).toEqual({
      id: '06',
      short: 'Distributed Decision Making',
      from: 'Centralized Authority',
      peers: 29,
    })
    expect(detail?.cases).toHaveLength(1)
  })

  it('knows no trend outside the eight', async () => {
    expect(await setup().service.trend('99')).toBeNull()
  })

  it('lists trends without their keywords (R-ASK-6)', async () => {
    const [first] = await setup().service.trends()

    expect(first).toEqual({
      id: '01',
      short: 'Purpose & Values',
      from: 'Profit',
      peers: 12,
    })
  })

  it('saves a challenge with the trend the matcher picked (R-ASK-4,5)', async () => {
    const { service } = setup()

    const challenge = await service.create('m-ada', decide, () => 'c-1')

    expect(challenge).toMatchObject({
      id: 'c-1',
      memberId: 'm-ada',
      autoTrend: '06',
      trendId: null,
    })
  })

  it('shows a challenge to its author only (R-NAV-8)', async () => {
    const { service } = setup()
    await service.create('m-ada', decide, () => 'c-1')

    expect(await service.get('m-ada', 'c-1')).not.toBeNull()
    expect(await service.get('m-bob', 'c-1')).toBeNull()
  })

  it('confirms the matched trend without marking it overridden (R-ASK-7)', async () => {
    const { service, rows } = setup()
    await service.create('m-ada', decide, () => 'c-1')

    expect(await service.confirmTrend('m-ada', 'c-1', '06')).toBe('saved')
    expect(rows.get('c-1')).toMatchObject({ trendId: '06', overridden: false })
  })

  it('records an override when the author picks another trend (R-ASK-6)', async () => {
    const { service, rows } = setup()
    await service.create('m-ada', decide, () => 'c-1')

    await service.confirmTrend('m-ada', 'c-1', '02')

    expect(rows.get('c-1')).toMatchObject({ trendId: '02', overridden: true })
  })

  it('reports a submitted challenge by its length, never its words (R-ANA-1,3)', async () => {
    const { service, tracked } = setup()

    await service.create('m-ada', decide, () => 'c-1')

    expect(tracked).toEqual([
      ['m-ada', { name: 'challenge_submitted', char_count: decide.length }],
    ])
  })

  it('reports the trend chosen and whether it overrode the matcher (R-ANA-1)', async () => {
    const { service, tracked } = setup()
    await service.create('m-ada', decide, () => 'c-1')

    await service.confirmTrend('m-ada', 'c-1', '02')

    expect(tracked.at(-1)).toEqual([
      'm-ada',
      { name: 'trend_assigned', trend_id: '02', overridden: true },
    ])
  })

  it('refuses an unknown trend, and a challenge that is not theirs', async () => {
    const { service } = setup()
    await service.create('m-ada', decide, () => 'c-1')

    expect(await service.confirmTrend('m-ada', 'c-1', '99')).toBe(
      'unknown_trend',
    )
    expect(await service.confirmTrend('m-bob', 'c-1', '02')).toBe('not_found')
  })

  it('matches on the confirmed trend, leaving the viewer out (R-ASK-8)', async () => {
    const { service, peerCalls } = setup()
    await service.create('m-ada', decide, () => 'c-1')
    await service.confirmTrend('m-ada', 'c-1', '07')

    const matches = await service.matches('m-ada', 'c-1')

    expect(matches?.trend.id).toBe('07')
    expect(matches?.sameBoat).toEqual([peer])
    expect(matches?.cases).toHaveLength(1)
    expect(peerCalls).toEqual([['07', 'm-ada']])
  })

  it('matches on the picked trend before one is confirmed', async () => {
    const { service } = setup()
    await service.create('m-ada', decide, () => 'c-1')

    expect((await service.matches('m-ada', 'c-1'))?.trend.id).toBe('06')
  })

  it('shows nobody else the matches', async () => {
    const { service } = setup()
    await service.create('m-ada', decide, () => 'c-1')

    expect(await service.matches('m-bob', 'c-1')).toBeNull()
  })
})
