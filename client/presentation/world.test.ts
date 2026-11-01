import { describe, expect, it } from 'vitest'
import type { NetworkTimeline } from '../../src/network/timeline'
import { buildWorld, worldTuning } from './world'

const timeline: NetworkTimeline = {
  nodes: [0, 1, 2, 3].map((id) => ({
    id,
    at: id / 4,
    day: '2026-10-01',
    self: false,
  })),
  links: [
    { source: 0, target: 1, at: 0.3, day: '2026-10-02' },
    { source: 2, target: 3, at: 0.8, day: '2026-10-03' },
  ],
  moons: [
    { node: 1, at: 0.4, day: '2026-10-02' },
    { node: 3, at: 0.9, day: '2026-10-04' },
  ],
  own: null,
}

const cast = [
  { handle: 'pioneer', name: 'P', photo: null, groups: ['pioneers'], node: 2 },
  {
    handle: 'dev-one',
    name: 'D',
    photo: null,
    groups: ['developers'],
    node: 3,
  },
  {
    handle: 'absent',
    name: 'A',
    photo: null,
    groups: ['developers'],
    node: null,
  },
]

const script = {
  featuredMoonAt: 0.85,
  founders: { handles: ['f1', 'f2'] as [string, string] },
}
const world = buildWorld({ timeline, cast }, script)

describe('buildWorld (R-PRES-4, R-PRES-7)', () => {
  it('counts the whole network since launch', () => {
    expect(world.totals).toEqual({ members: 4, challenges: 2, connections: 2 })
  })

  it('puts the founders either side of the centre', () => {
    const [one, two] = world.founders

    expect(one.x).toBeLessThan(0)
    expect(two.x).toBe(-one.x)
    expect(world.pointOf('f2')).toEqual(two)
  })

  it('places a cast member on their node, and nobody the cast does not place', () => {
    expect(world.pointOf('pioneer')).toEqual(world.points[2])
    expect(world.pointOf('absent')).toBeNull()
    expect(world.nodeOf('dev-one')).toBe(3)
  })

  it('features the moon popping in nearest its moment', () => {
    expect(world.featuredMoon).toBe(1)
    expect(world.aim({ on: 'moon' }).target).toEqual(world.points[3])
  })

  it('aims close at a person, and at the whole network for anyone unplaced (R-PRES-5)', () => {
    expect(world.aim({ on: 'person', who: 'pioneer' })).toEqual({
      target: world.points[2],
      radii: worldTuning.personRadii,
    })
    expect(world.aim({ on: 'person', who: 'absent' }).radii).toBe(1)
  })

  it('aims at a group’s placed members', () => {
    expect(world.groupOf('developers')).toEqual(['dev-one', 'absent'])
    expect(world.aim({ on: 'group', group: 'developers' }).target).toEqual(
      world.points[3],
    )
    expect(world.aim({ on: 'group', group: 'nobody' }).radii).toBe(1)
  })

  it('stands far out for the future, on copies beyond today’s network', () => {
    expect(world.aim({ on: 'beyond' }).radii).toBe(worldTuning.beyondRadii)
    expect(world.futureOffsets).toHaveLength(worldTuning.futureCopies)
    for (const offset of world.futureOffsets)
      expect(Math.hypot(offset.x, offset.y, offset.z)).toBeGreaterThan(
        world.radius * 2,
      )
  })
})
