import { describe, expect, it } from 'vitest'
import { moonAt, orbitTuning, orbitsOf } from './orbits'

const timeline = {
  moons: [
    { node: 0, at: 0.1, day: '2026-10-01' },
    { node: 3, at: 0.2, day: '2026-10-02' },
    { node: 0, at: 0.3, day: '2026-10-03' },
  ],
}
const center = { x: 10, y: -4, z: 2 }
const distance = (a: { x: number; y: number; z: number }): number =>
  Math.hypot(a.x - center.x, a.y - center.y, a.z - center.z)

describe('orbitsOf (R-NET-11)', () => {
  const orbits = orbitsOf(timeline)

  it('puts a member’s next challenge on the next ring out', () => {
    expect(orbits.map((orbit) => [orbit.node, orbit.radius])).toEqual([
      [0, orbitTuning.firstRadius],
      [3, orbitTuning.firstRadius],
      [0, orbitTuning.firstRadius + orbitTuning.ringGap],
    ])
  })

  it('turns outer rings slower', () => {
    expect(orbits[2]?.radiansPerMs).toBeLessThan(orbits[0]?.radiansPerMs ?? 0)
  })

  it('starts neighbours at different places', () => {
    expect(orbits[0]?.phase).not.toBe(orbits[2]?.phase)
  })
})

describe('moonAt', () => {
  const [orbit] = orbitsOf(timeline)

  it('keeps a moon on its ring around the member', () => {
    for (const time of [0, 1234, 98765])
      expect(distance(moonAt(orbit!, center, time, false))).toBeCloseTo(
        orbit!.radius,
      )
  })

  it('moves a moon as time passes', () => {
    expect(moonAt(orbit!, center, 1000, false)).not.toEqual(
      moonAt(orbit!, center, 0, false),
    )
  })

  it('holds a moon still for reduced motion (R-NET-9)', () => {
    expect(moonAt(orbit!, center, 5000, true)).toEqual(
      moonAt(orbit!, center, 0, true),
    )
  })
})
