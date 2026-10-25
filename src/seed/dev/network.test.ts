import { describe, expect, it } from 'vitest'
import type { SeedChallenge, SeedMember } from '../types.js'
import { devFixtures } from './index.js'
import { connectionsFor, networkShape, withJoinTimes } from './network.js'

const HOURS_PER_DAY = 24

const member = (email: string): SeedMember => ({
  email,
  name: email,
  jobTitle: 'Coach',
  org: 'Org',
  sector: 'healthcare',
  companySize: '51-250',
  roles: ['member'],
})

describe('the dev network (R-SEED-10)', () => {
  const fixtures = devFixtures()
  const joined = new Map(
    fixtures.members.map((m) => [m.email, m.joinedHoursAgo ?? 0]),
  )

  it('holds about a hundred members and seventy challenges', () => {
    expect(fixtures.members).toHaveLength(100)
    expect(fixtures.challenges).toHaveLength(70)
    expect(new Set(fixtures.members.map((m) => m.email)).size).toBe(100)
  })

  it('spreads challenges over every trend', () => {
    const trends = new Set(fixtures.challenges.map((c) => c.trendId))

    expect([...trends].sort()).toEqual([
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
      '07',
      '08',
    ])
  })

  it('has members join over weeks, with one event’s crowd in a few hours', () => {
    const eventEnd = networkShape.eventDaysAgo * HOURS_PER_DAY
    const inEvent = [...joined.values()].filter(
      (hours) =>
        hours <= eventEnd && hours >= eventEnd - networkShape.eventHours,
    )

    expect(Math.max(...joined.values())).toBe(
      networkShape.firstJoinDaysAgo * HOURS_PER_DAY,
    )
    expect(inEvent.length).toBeGreaterThan(30)
  })

  it('connects the dev admin, so they find their own lines (R-NET-2)', () => {
    const [admin] = fixtures.members
    const theirs = fixtures.connections.filter(
      (c) =>
        c.status === 'accepted' &&
        [c.requesterEmail, c.targetEmail].includes(admin?.email ?? ''),
    )

    expect(theirs.length).toBeGreaterThan(0)
  })

  it('lets the dev admin join first', () => {
    const [admin] = fixtures.members

    expect(admin?.joinedHoursAgo).toBe(Math.max(...joined.values()))
  })

  it('has requests in every state, most of them accepted', () => {
    const count = (status: string): number =>
      fixtures.connections.filter((c) => c.status === status).length

    expect(count('accepted')).toBeGreaterThan(100)
    expect(count('pending')).toBeGreaterThan(0)
    expect(count('declined')).toBeGreaterThan(0)
  })

  it('asks only after both members joined, and answers after asking', () => {
    for (const request of fixtures.connections) {
      const bothIn = Math.min(
        joined.get(request.requesterEmail) ?? -1,
        joined.get(request.targetEmail) ?? -1,
      )
      expect(request.requestedHoursAgo).toBeLessThanOrEqual(bothIn)
      expect(request.respondedHoursAgo ?? 0).toBeLessThanOrEqual(
        request.requestedHoursAgo,
      )
      expect(request.respondedHoursAgo === null).toBe(
        request.status === 'pending',
      )
    }
  })

  it('asks over a challenge of the member asked, never of oneself', () => {
    const challenges = new Set(
      fixtures.challenges.map((c) => `${c.authorEmail}|${c.body}`),
    )

    for (const request of fixtures.connections) {
      expect(request.requesterEmail).not.toBe(request.targetEmail)
      expect(request.challenge?.authorEmail).toBe(request.targetEmail)
      const { authorEmail = '', body = '' } = request.challenge ?? {}
      expect(challenges.has(`${authorEmail}|${body}`)).toBe(true)
    }
  })

  it('is the same network on every run', () => {
    expect(devFixtures()).toEqual(fixtures)
  })
})

describe('connectionsFor', () => {
  const members = withJoinTimes(['a', 'b', 'c'].map(member))
  const challenge = (authorEmail: string): SeedChallenge => ({
    authorEmail,
    trendId: '06',
    body: `${authorEmail}'s challenge`,
  })

  it('asks peers in the same boat and those who have been there', () => {
    const asks = connectionsFor(
      members,
      [challenge('a'), challenge('b')],
      [{ email: 'c', trendId: '06', note: 'Did it.' }],
      { ...networkShape, requestChance: 1 },
    )

    expect(
      asks.map((ask) => [ask.requesterEmail, ask.targetEmail, ask.kind]),
    ).toEqual([
      ['b', 'a', 'same_boat'],
      ['c', 'a', 'been_there'],
      ['a', 'b', 'same_boat'],
      ['c', 'b', 'been_there'],
    ])
  })

  it('asks nobody about a trend nobody else shares', () => {
    expect(
      connectionsFor(members, [challenge('a')], [], {
        ...networkShape,
        requestChance: 1,
      }),
    ).toEqual([])
  })

  it('leaves out someone not in the roster', () => {
    expect(
      connectionsFor(
        members,
        [challenge('a')],
        [{ email: 'stranger', trendId: '06', note: 'Did it.' }],
        { ...networkShape, requestChance: 1 },
      ),
    ).toEqual([])
  })
})
