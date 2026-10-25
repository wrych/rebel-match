import { describe, expect, it } from 'vitest'
import { buildTimeline, paceOf, type NetworkFacts } from './timeline.js'

const on = (day: string, time = '12:00'): Date => new Date(`${day}T${time}Z`)

const facts: NetworkFacts = {
  members: [
    { id: 'm-cleo', joinedAt: on('2026-10-03') },
    { id: 'm-ada', joinedAt: on('2026-10-01', '23:59') },
    { id: 'm-ben', joinedAt: on('2026-10-01', '08:00') },
  ],
  connections: [
    { a: 'm-cleo', b: 'm-ada', formedAt: on('2026-10-05') },
    { a: 'm-ada', b: 'm-ben', formedAt: on('2026-10-02') },
  ],
  challenges: [],
}

describe('buildTimeline (R-NET-1, R-NET-3)', () => {
  it('orders members by when they joined, as positions and days only', () => {
    const { nodes } = buildTimeline(facts, null)

    expect(nodes.map(({ id, day }) => ({ id, day }))).toEqual([
      { id: 0, day: '2026-10-01' },
      { id: 1, day: '2026-10-01' },
      { id: 2, day: '2026-10-03' },
    ])
  })

  it('carries no member id and no time of day', () => {
    const shown = JSON.stringify(buildTimeline(facts, 'm-ada'))

    expect(shown).not.toMatch(/m-(ada|ben|cleo)/)
    expect(shown).not.toMatch(/T\d\d:/)
  })

  it('marks the viewer, and nobody without one (R-NET-2)', () => {
    const marked = buildTimeline(facts, 'm-cleo').nodes.filter((n) => n.self)

    expect(marked.map((n) => n.id)).toEqual([2])
    expect(buildTimeline(facts, null).nodes.some((n) => n.self)).toBe(false)
  })

  it('orders links by when they formed', () => {
    const { links } = buildTimeline(facts, null)

    expect(
      links.map(({ source, target, day }) => [source, target, day]),
    ).toEqual([
      [0, 1, '2026-10-02'],
      [1, 2, '2026-10-05'],
    ])
  })

  it('plays joins and connections on one clock, from 0 to 1 (R-NET-7)', () => {
    const { nodes, links } = buildTimeline(facts, null)
    const places = [nodes[0], nodes[1], links[0], nodes[2], links[1]].map(
      (event) => event?.at,
    )

    expect(places[0]).toBe(0)
    expect(places[4]).toBe(1)
    expect(places).toEqual([...places].sort((a, b) => (a ?? 0) - (b ?? 0)))
  })

  it('draws a pair connected twice once, from the first time', () => {
    const twice = {
      ...facts,
      connections: [
        { a: 'm-ben', b: 'm-ada', formedAt: on('2026-10-09') },
        { a: 'm-ada', b: 'm-ben', formedAt: on('2026-10-04') },
      ],
    }

    expect(buildTimeline(twice, null).links.map((l) => l.day)).toEqual([
      '2026-10-04',
    ])
  })

  it('never shows a link before both its ends', () => {
    const early = {
      ...facts,
      connections: [{ a: 'm-ben', b: 'm-cleo', formedAt: on('2026-09-01') }],
    }
    const { nodes, links } = buildTimeline(early, null)

    expect(links[0]?.day).toBe('2026-10-03')
    expect(links[0]?.at).toBeGreaterThanOrEqual(nodes[2]?.at ?? 1)
  })

  it('leaves out a link to someone not in the network (R-NET-4)', () => {
    const gone = {
      ...facts,
      connections: [
        { a: 'm-ada', b: 'm-erased', formedAt: on('2026-10-02') },
        { a: 'm-ada', b: 'm-ada', formedAt: on('2026-10-02') },
      ],
    }

    expect(buildTimeline(gone, null).links).toEqual([])
  })

  it('is empty for an empty network', () => {
    expect(
      buildTimeline({ members: [], connections: [], challenges: [] }, null),
    ).toEqual({
      nodes: [],
      links: [],
      moons: [],
    })
  })
})

describe('moons (R-NET-11)', () => {
  const posting = {
    ...facts,
    challenges: [
      { memberId: 'm-cleo', postedAt: on('2026-10-04') },
      { memberId: 'm-ada', postedAt: on('2026-09-01') },
      { memberId: 'm-erased', postedAt: on('2026-10-02') },
    ],
  }

  it('circles each challenge around its member, in the order posted', () => {
    const { moons } = buildTimeline(posting, null)

    expect(moons.map(({ node, day }) => [node, day])).toEqual([
      [1, '2026-10-01'],
      [2, '2026-10-04'],
    ])
  })

  it('never shows a moon before its member', () => {
    const { nodes, moons } = buildTimeline(posting, null)

    for (const moon of moons)
      expect(moon.at).toBeGreaterThanOrEqual(nodes[moon.node]?.at ?? 1)
  })

  it('plays moons on the same clock as joins and connections', () => {
    const { links, moons } = buildTimeline(posting, null)
    const cleosMoon = moons[1]?.at ?? 0

    expect(cleosMoon).toBeGreaterThan(links[0]?.at ?? 1)
    expect(cleosMoon).toBeLessThan(links[1]?.at ?? 0)
  })

  it('carries no text, trend or member id', () => {
    expect(JSON.stringify(buildTimeline(posting, 'm-ada').moons)).toMatch(
      /^\[(\{"node":\d+,"at":[\d.]+,"day":"[\d-]+"\},?)*\]$/,
    )
  })
})

describe('paceOf (R-NET-7)', () => {
  const hour = 3_600_000

  it('gives a busy stretch more of the replay than the calendar would', () => {
    const times = [0, 1, 2, 3, 100 * hour]
    const pace = paceOf(times)

    expect(pace[3]).toBeGreaterThan(0.4)
    expect(pace[4]).toBe(1)
  })

  it('still follows the calendar in part across a quiet stretch', () => {
    const pace = paceOf([0, hour, 99 * hour, 100 * hour])

    expect((pace[2] ?? 0) - (pace[1] ?? 0)).toBeGreaterThan(1 / 3)
  })

  it('spreads events at one moment evenly', () => {
    expect(paceOf([5, 5, 5])).toEqual([0, 0.5, 1])
  })

  it('places a lone event at the start', () => {
    expect(paceOf([5])).toEqual([0])
  })

  it('rounds to a thousandth, never telling a moment more exactly', () => {
    for (const at of paceOf([0, 7, 13, 1000, 1001, 99_999]))
      expect(Math.round(at * 1000)).toBeCloseTo(at * 1000, 9)
  })
})
