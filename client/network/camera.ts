import type { Point } from './layout'

/** Where the camera is, around what it looks at. */
export interface Pose {
  target: Point
  distance: number
  azimuth: number
  elevation: number
}

/** What the replay wants the camera to look at, from how far. */
export interface Goal {
  target: Point
  distance: number
}

/** How the replay steers: how fast it eases to a goal and turns, the room
 * left around what it frames, and at what height. */
export interface Steering {
  easeMs: number
  turnPerMs: number
  elevation: number
  margin: number
  smallestShare: number
  focusShare: number
  focusPull: number
}

export const steering: Steering = {
  easeMs: 900,
  turnPerMs: 0.00012,
  elevation: 0.35,
  margin: 1.1,
  smallestShare: 0.45,
  focusShare: 0.85,
  focusPull: 0.5,
}

const ORIGIN: Point = { x: 0, y: 0, z: 0 }
const DEGREES = Math.PI / 180

/** How many radii back a camera stands to fit a sphere in its narrower
 * side, with the steering's margin around it. */
export function fitOf(
  fovDegrees: number,
  aspect: number,
  how: Steering = steering,
): number {
  const vertical = (fovDegrees * DEGREES) / 2
  const horizontal = Math.atan(Math.tan(vertical) * aspect)
  return how.margin / Math.sin(Math.min(vertical, horizontal))
}

const MOST_UPRIGHT = Math.PI / 2 - 0.01

const lengthOf = (p: Point): number => Math.hypot(p.x, p.y, p.z)

/** How far out the farthest of the first `shown` points lies. */
export function reach(points: readonly Point[], shown = points.length): number {
  let farthest = 0
  for (let index = 0; index < Math.min(shown, points.length); index++)
    farthest = Math.max(farthest, lengthOf(points[index] as Point))
  return farthest
}

/** The replay's goal: the network as far as it has grown, never closer than
 * a share of the whole; once it ends, drawn towards the viewer's point so
 * they are near the middle and the network still around them (R-NET-2). */
export function goalOf(
  points: readonly Point[],
  shown: number,
  focus: Point | null,
  floor: number,
  fit: number,
  how: Steering = steering,
): Goal {
  const whole = Math.max(reach(points), floor)
  if (focus !== null)
    return {
      target: {
        x: focus.x * how.focusPull,
        y: focus.y * how.focusPull,
        z: focus.z * how.focusPull,
      },
      distance: whole * how.focusShare * fit,
    }
  const grown = Math.max(reach(points, shown), whole * how.smallestShare)
  return { target: ORIGIN, distance: grown * fit }
}

const toward = (from: number, to: number, share: number): number =>
  from + (to - from) * share

/** The pose after `elapsedMs` of easing towards the goal and turning; still,
 * it is the goal at once and does not turn (R-NET-9). */
export function stepTo(
  pose: Pose,
  goal: Goal,
  elapsedMs: number,
  still: boolean,
  how: Steering = steering,
): Pose {
  const share = still ? 1 : 1 - Math.exp(-Math.max(elapsedMs, 0) / how.easeMs)
  return {
    target: {
      x: toward(pose.target.x, goal.target.x, share),
      y: toward(pose.target.y, goal.target.y, share),
      z: toward(pose.target.z, goal.target.z, share),
    },
    distance: toward(pose.distance, goal.distance, share),
    azimuth: still ? pose.azimuth : pose.azimuth + elapsedMs * how.turnPerMs,
    elevation: toward(pose.elevation, how.elevation, share),
  }
}

/** Where the camera stands for a pose. */
export function positionOf(pose: Pose): Point {
  const flat = pose.distance * Math.cos(pose.elevation)
  return {
    x: pose.target.x + flat * Math.sin(pose.azimuth),
    y: pose.target.y + pose.distance * Math.sin(pose.elevation),
    z: pose.target.z + flat * Math.cos(pose.azimuth),
  }
}

/** The pose of a camera standing at `position`, looking at `target`: where
 * the replay picks up after the member hands the view back. */
export function poseOf(position: Point, target: Point): Pose {
  const x = position.x - target.x
  const y = position.y - target.y
  const z = position.z - target.z
  const distance = Math.hypot(x, y, z) || 1
  const elevation = Math.asin(Math.max(-1, Math.min(1, y / distance)))
  return {
    target,
    distance,
    azimuth: Math.atan2(x, z),
    elevation: Math.max(-MOST_UPRIGHT, Math.min(MOST_UPRIGHT, elevation)),
  }
}
