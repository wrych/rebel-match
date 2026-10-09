import { describe, expect, it } from 'vitest'
import type { Challenge } from './challenges.js'
import { newestFirst, type RankablePeer } from './match-ranker.js'

const challenge: Challenge = {
  id: 'c-1',
  memberId: 'm-ada',
  body: 'Since we flattened, nobody knows who can decide what any more.',
  trendId: '06',
  autoTrend: '06',
  overridden: false,
  createdAt: '2026-11-08T10:00:00.000Z',
}

function peer(memberId: string, name: string, since: string): RankablePeer {
  return {
    memberId,
    name,
    jobTitle: null,
    org: null,
    sector: null,
    companySize: null,
    note: 'Ran a decision-mapping sprint.',
    since: new Date(since),
  }
}

describe('newestFirst', () => {
  it('puts the latest challenge or offer first (ADR 0048)', () => {
    const ranked = newestFirst(
      'beenThere',
      [
        peer('m-1', 'Anna', '2026-11-01T09:00:00Z'),
        peer('m-2', 'Bram', '2026-11-03T09:00:00Z'),
        peer('m-3', 'Cleo', '2026-11-02T09:00:00Z'),
      ],
      challenge,
    )

    expect(ranked.map((p) => p.name)).toEqual(['Bram', 'Cleo', 'Anna'])
  })

  it('breaks a tie by name, then by member', () => {
    const at = '2026-11-01T09:00:00Z'
    const ranked = newestFirst(
      'sameBoat',
      [
        peer('m-9', 'Zoë', at),
        peer('m-2', 'Anna', at),
        peer('m-1', 'Anna', at),
      ],
      challenge,
    )

    expect(ranked.map((p) => p.memberId)).toEqual(['m-1', 'm-2', 'm-9'])
  })

  it('returns cards without when they entered the trend', () => {
    const [first] = newestFirst(
      'sameBoat',
      [peer('m-1', 'Anna', '2026-11-01T09:00:00Z')],
      challenge,
    )

    expect(first).not.toHaveProperty('since')
  })
})
