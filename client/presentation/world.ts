import type { CastMember } from '../../src/presentation/cast'
import type { NetworkTimeline } from '../../src/network/timeline'
import { reach } from '../network/camera'
import { layout, type Point } from '../network/layout'
import type { Aim, DirectorWorld, Script } from './director'

/** What the server sends the stage (R-PRES-6). */
export interface PresentationData {
  timeline: NetworkTimeline
  cast: CastMember[]
}

/** Everything the film is played over: the real network laid out, and the
 * invented parts around it (R-PRES-4). */
export interface World extends DirectorWorld {
  timeline: NetworkTimeline
  points: Point[]
  radius: number
  founders: [Point, Point]
  lone: Point
  futureOffsets: Point[]
  featuredMoon: number | null
  /** Where a handle stands: a founder, or a cast member in the network. */
  pointOf(handle: string): Point | null
  /** The network node a handle stands on, for lights. */
  nodeOf(handle: string): number | null
  castOf(handle: string): CastMember | null
}

/** How close each aim stands, in the network's radii, and the invented
 * parts' size. */
export const worldTuning = {
  smallestRadius: 20,
  founderSpread: 0.07,
  personRadii: 0.2,
  foundersRadii: 0.16,
  loneRadii: 0.12,
  moonRadii: 0.18,
  groupRadii: 0.7,
  beyondRadii: 600,
  futureCopies: 60,
  futureFirstShell: 2.4,
  futureShellGrowth: 1.15,
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const ORIGIN: Point = { x: 0, y: 0, z: 0 }

// Copies of today's network on wider and wider shells, spread by the golden
// angle, for the growth past today.
function futureOffsets(radius: number, tuning = worldTuning): Point[] {
  return Array.from({ length: tuning.futureCopies }, (_, index) => {
    const y = 1 - (2 * (index + 0.5)) / tuning.futureCopies
    const around = Math.sqrt(1 - y * y)
    const angle = index * GOLDEN_ANGLE
    const shell =
      radius *
      tuning.futureFirstShell *
      tuning.futureShellGrowth ** Math.sqrt(index)
    return {
      x: Math.cos(angle) * around * shell,
      y: y * shell,
      z: Math.sin(angle) * around * shell,
    }
  })
}

function featuredMoon(timeline: NetworkTimeline, at: number): number | null {
  let best: number | null = null
  timeline.moons.forEach((moon, index) => {
    const known = best === null ? null : timeline.moons[best]
    if (
      known === undefined ||
      known === null ||
      Math.abs(moon.at - at) < Math.abs(known.at - at)
    )
      best = index
  })
  return best
}

function centroid(points: readonly Point[]): Point {
  if (points.length === 0) return ORIGIN
  const sum = points.reduce(
    (total, p) => ({ x: total.x + p.x, y: total.y + p.y, z: total.z + p.z }),
    ORIGIN,
  )
  return {
    x: sum.x / points.length,
    y: sum.y / points.length,
    z: sum.z / points.length,
  }
}

// Everything since launch: the whole network (R-PRES-7).
const totalsOf = (timeline: NetworkTimeline): World['totals'] => ({
  members: timeline.nodes.length,
  challenges: timeline.moons.length,
  connections: timeline.links.length,
})

interface Places {
  pointOf(handle: string): Point | null
  groupOf(group: string): string[]
  moonPoint: Point | null
}

type Fixed = Exclude<Aim['on'], 'person' | 'group' | 'moon'>

const fixedRadii = (tuning: typeof worldTuning): Record<Fixed, number> => ({
  network: 1,
  founders: tuning.foundersRadii,
  lone: tuning.loneRadii,
  beyond: tuning.beyondRadii,
})

const WHOLE = { target: ORIGIN, radii: 1 }

// Someone the cast does not place is not visited: the camera stays on the
// whole network (R-PRES-5).
const near = (
  at: Point | null,
  radii: number,
): { target: Point; radii: number } =>
  at === null ? WHOLE : { target: at, radii }

function groupCentre(group: string, places: Places): Point | null {
  const members = places.groupOf(group).flatMap((handle) => {
    const at = places.pointOf(handle)
    return at === null ? [] : [at]
  })
  return members.length === 0 ? null : centroid(members)
}

function aimAt(
  to: Aim,
  places: Places,
  tuning: typeof worldTuning,
): { target: Point; radii: number } {
  if (to.on === 'person')
    return near(places.pointOf(to.who), tuning.personRadii)
  if (to.on === 'group')
    return near(groupCentre(to.group, places), tuning.groupRadii)
  if (to.on === 'moon') return near(places.moonPoint, tuning.moonRadii)
  return { target: ORIGIN, radii: fixedRadii(tuning)[to.on] }
}

function foundersAt(
  radius: number,
  tuning: typeof worldTuning,
): [Point, Point] {
  const spread = radius * tuning.founderSpread
  return [
    { x: -spread, y: 0, z: 0 },
    { x: spread, y: 0, z: 0 },
  ]
}

/** The world for a showing: the real network laid out once, founders at its
 * heart, the lone dot of the closing world, and copies for the future. */
export function buildWorld(
  data: PresentationData,
  script: Pick<Script, 'featuredMoonAt'> & {
    founders: { handles: [string, string] }
  },
  tuning = worldTuning,
): World {
  const { timeline, cast } = data
  const points = layout(timeline.nodes.length, timeline.links)
  const radius = Math.max(reach(points), tuning.smallestRadius)
  const founders = foundersAt(radius, tuning)
  const byHandle = new Map(cast.map((member) => [member.handle, member]))
  const moon = featuredMoon(timeline, script.featuredMoonAt)
  const nodeOf = (handle: string): number | null =>
    byHandle.get(handle)?.node ?? null
  const pointOf = (handle: string): Point | null => {
    const founder = script.founders.handles.indexOf(handle)
    if (founder >= 0) return founders[founder] ?? null
    const node = nodeOf(handle)
    return node === null ? null : (points[node] ?? null)
  }
  const groupOf = (group: string): string[] =>
    cast
      .filter((member) => member.groups.includes(group))
      .map((member) => member.handle)
  const moonNode = moon === null ? undefined : timeline.moons[moon]?.node
  const places: Places = {
    pointOf,
    groupOf,
    moonPoint: moonNode === undefined ? null : (points[moonNode] ?? null),
  }
  return {
    timeline,
    points,
    radius,
    founders,
    lone: ORIGIN,
    futureOffsets: futureOffsets(radius, tuning),
    featuredMoon: moon,
    totals: totalsOf(timeline),
    aim: (to) => aimAt(to, places, tuning),
    groupOf,
    pointOf,
    nodeOf,
    castOf: (handle) => byHandle.get(handle) ?? null,
  }
}
