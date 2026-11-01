import type { NetworkTimeline } from '../../src/network/timeline'
import type { Point } from './layout'

/** One moon's path around its member: its ring, how fast it goes round,
 * where it starts, and how its plane tilts. */
export interface Orbit {
  node: number
  radius: number
  radiansPerMs: number
  phase: number
  tilt: number
  swing: number
}

/** How moons circle: the first ring's radius, the gap between rings, and
 * how long the first ring takes to go round. */
export const orbitTuning = {
  firstRadius: 5,
  ringGap: 2.2,
  firstTurnMs: 9000,
  outerSlowdown: 1.35,
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const FULL_TURN = 2 * Math.PI

/** Each moon's orbit: a member's k-th challenge on its k-th ring, outer
 * rings slower, planes and starting points spread by the golden angle so
 * neighbours never line up (R-NET-11). */
export function orbitsOf(
  timeline: Pick<NetworkTimeline, 'moons'>,
  tuning = orbitTuning,
): Orbit[] {
  const ringsSoFar = new Map<number, number>()
  return timeline.moons.map((moon, index) => {
    const ring = ringsSoFar.get(moon.node) ?? 0
    ringsSoFar.set(moon.node, ring + 1)
    const turnMs = tuning.firstTurnMs * tuning.outerSlowdown ** ring
    return {
      node: moon.node,
      radius: tuning.firstRadius + ring * tuning.ringGap,
      radiansPerMs: FULL_TURN / turnMs,
      phase: (index * GOLDEN_ANGLE) % FULL_TURN,
      tilt: ((index * GOLDEN_ANGLE * 0.5) % Math.PI) - Math.PI / 2,
      swing: (moon.node * GOLDEN_ANGLE) % FULL_TURN,
    }
  })
}

/** Where a moon is at `timeMs` around a member at `center`; still, it stays
 * where it starts (R-NET-9). */
export function moonAt(
  orbit: Orbit,
  center: Point,
  timeMs: number,
  still: boolean,
): Point {
  const angle = orbit.phase + (still ? 0 : timeMs * orbit.radiansPerMs)
  const flatX = Math.cos(angle) * orbit.radius
  const flatZ = Math.sin(angle) * orbit.radius
  const y = flatZ * Math.sin(orbit.tilt)
  const z = flatZ * Math.cos(orbit.tilt)
  return {
    x: center.x + flatX * Math.cos(orbit.swing) - z * Math.sin(orbit.swing),
    y: center.y + y,
    z: center.z + flatX * Math.sin(orbit.swing) + z * Math.cos(orbit.swing),
  }
}
