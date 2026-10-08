import { blocked, type Floor, type Spot } from './floors'
import { overlaps, solidsOf } from './walls'

const STEPS: readonly Spot[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
]

const keyOf = (spot: Spot): number => spot.y * 10_000 + spot.x

function neighbours(floor: Floor, spot: Spot): Spot[] {
  return STEPS.map((step) => ({
    x: spot.x + step.x,
    y: spot.y + step.y,
  })).filter((next) => !blocked(floor, next.x, next.y))
}

/** Walking distances in tiles from `from` to every tile reachable from it. */
export function distancesFrom(floor: Floor, from: Spot): Map<number, number> {
  const distance = new Map<number, number>([[keyOf(from), 0]])
  const queue: Spot[] = [from]
  for (let index = 0; index < queue.length; index += 1) {
    const spot = queue[index] as Spot
    const here = distance.get(keyOf(spot)) ?? 0
    for (const next of neighbours(floor, spot)) {
      if (distance.has(keyOf(next))) continue
      distance.set(keyOf(next), here + 1)
      queue.push(next)
    }
  }
  return distance
}

/** The walking distance between two tiles, or Infinity when none joins them. */
export function walkingDistance(
  distances: Map<number, number>,
  to: Spot,
): number {
  return distances.get(keyOf(to)) ?? Number.POSITIVE_INFINITY
}

/** The tiles to walk from `from` to `to`, `to` included and `from` not; empty
 * when they are the same tile or nothing joins them. */
export function path(floor: Floor, from: Spot, to: Spot): Spot[] {
  const distances = distancesFrom(floor, to)
  if (!distances.has(keyOf(from))) return []
  const steps: Spot[] = []
  let at = from
  while (keyOf(at) !== keyOf(to)) {
    const here = walkingDistance(distances, at)
    const next = neighbours(floor, at).find(
      (spot) => walkingDistance(distances, spot) === here - 1,
    )
    if (next === undefined) return []
    steps.push(next)
    at = next
  }
  return steps
}

/** The tile a position stands on. */
export const tileOf = (position: Spot): Spot => ({
  x: Math.floor(position.x),
  y: Math.floor(position.y),
})

/** The centre of a tile, where walkers aim. */
export const centreOf = (tile: Spot): Spot => ({
  x: tile.x + 0.5,
  y: tile.y + 0.5,
})

/** The straight-line distance between two positions. */
export const distance = (a: Spot, b: Spot): number =>
  Math.hypot(a.x - b.x, a.y - b.y)

// Moving one axis at a time lets the player slide along a wall rather than
// stick to it.
function free(floor: Floor, at: Spot, radius: number): boolean {
  const body = {
    x: at.x - radius,
    y: at.y - radius,
    w: 2 * radius,
    h: 2 * radius,
  }
  for (let y = Math.floor(body.y); y <= Math.floor(body.y + body.h); y += 1)
    for (let x = Math.floor(body.x); x <= Math.floor(body.x + body.w); x += 1)
      if (solidsOf(floor, x, y).some((solid) => overlaps(body, solid)))
        return false
  return floor.obstacles.every(
    (obstacle) => distance(at, obstacle) >= obstacle.r + radius,
  )
}

/** Moves a body of `radius` by `delta`, as far as walls, furniture and
 * obstacles let it. */
export function slide(
  floor: Floor,
  at: Spot,
  delta: Spot,
  radius: number,
): Spot {
  const across = { x: at.x + delta.x, y: at.y }
  const afterX = free(floor, across, radius) ? across : at
  const down = { x: afterX.x, y: afterX.y + delta.y }
  return free(floor, down, radius) ? down : afterX
}
