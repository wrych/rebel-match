import { describe, expect, it } from 'vitest'
import type { NetworkTimeline } from '../../src/network/timeline'
import { networkOpen, ownLinksHint, selfStats } from './network'

describe('ownLinksHint (R-NET-13)', () => {
  it('says nothing while the member’s lines show, or with no viewer', () => {
    expect(ownLinksHint({ count: 7, needed: 5, shown: true })).toBeNull()
    expect(ownLinksHint(null)).toBeNull()
  })

  it('says how many it takes, how many they have, and why', () => {
    expect(ownLinksHint({ count: 1, needed: 5, shown: false })).toBe(
      '* Your own connections show once you have 5 connections. You have ' +
        '1 connection, and with so few you could tell who the dots at ' +
        'their ends are, which would say things about them they never shared.',
    )
  })

  it('says so when they have none yet', () => {
    expect(ownLinksHint({ count: 0, needed: 1, shown: false })).toMatch(
      /^\* Your own connections show once you have 1 connection\. You have no connections yet,/,
    )
  })
})

describe('selfStats (R-NET-14)', () => {
  const timeline: NetworkTimeline = {
    nodes: [
      { id: 0, at: 0, day: '2026-10-01', self: false },
      { id: 1, at: 0.4, day: '2026-10-03', self: true },
      { id: 2, at: 0.6, day: '2026-10-04', self: false },
    ],
    links: [
      { source: 0, target: 1, at: 0.5, day: '2026-10-04' },
      { source: 0, target: 2, at: 0.7, day: '2026-10-05' },
    ],
    moons: [
      { node: 1, at: 0.5, day: '2026-10-03' },
      { node: 2, at: 0.8, day: '2026-10-06' },
      { node: 1, at: 0.9, day: '2026-10-07' },
    ],
    own: { count: 1, needed: 0, shown: true },
  }

  it('counts the viewer’s connections and challenges, and when they joined', () => {
    expect(selfStats(timeline)).toEqual({
      connections: 1,
      hidden: false,
      challenges: 2,
      joined: '2026-10-03',
    })
  })

  it('counts connections left out, and marks them hidden (R-NET-13)', () => {
    const thin = {
      ...timeline,
      links: [],
      own: { count: 3, needed: 5, shown: false },
    }

    expect(selfStats(thin)).toMatchObject({ connections: 3, hidden: true })
  })

  it('is nothing when the replay marks nobody', () => {
    const nobody = {
      ...timeline,
      nodes: timeline.nodes.map((node) => ({ ...node, self: false })),
      own: null,
    }

    expect(selfStats(nobody)).toBeNull()
  })
})

describe('networkOpen (R-NET-5, R-NET-6)', () => {
  it('opens only while on, to a member who may see it', () => {
    expect(networkOpen(1, ['network:view'])).toBe(true)
    expect(networkOpen(0, ['network:view'])).toBe(false)
    expect(networkOpen(1, [])).toBe(false)
  })
})
