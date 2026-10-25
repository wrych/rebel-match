/** A point in the replay's space. */
export interface Point {
  x: number
  y: number
  z: number
}

/** How the layout settles; the defaults suit a few hundred members. */
export interface LayoutTuning {
  iterations: number
  spacing: number
  spring: number
  gravity: number
  seed: number
}

export const layoutDefaults: LayoutTuning = {
  iterations: 220,
  spacing: 12,
  spring: 0.04,
  gravity: 0.12,
  seed: 20261108,
}

// A small seeded generator, so a network lays out the same way on every
// screen and every replay (mulberry32).
function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function startingPoints(count: number, tuning: LayoutTuning): Point[] {
  const random = seeded(tuning.seed)
  const radius = tuning.spacing * Math.cbrt(Math.max(count, 1))
  return Array.from({ length: count }, () => ({
    x: (random() - 0.5) * radius,
    y: (random() - 0.5) * radius,
    z: (random() - 0.5) * radius,
  }))
}

// Two points closer than this share of the spacing push as if they were this
// close, so two at one spot do not fly apart.
const NEAREST = 0.1

type Push = (index: number, dx: number, dy: number, dz: number) => void

// Coulomb-like: a push falling with the square of the distance, so a network
// settles to a radius growing with the cube root of its size.
function repel(points: readonly Point[], spacing: number, push: Push): void {
  const reach = spacing ** 3
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i] as Point
      const b = points[j] as Point
      const dx = a.x - b.x
      const dy = a.y - b.y
      const dz = a.z - b.z
      const distance = Math.max(
        Math.sqrt(dx * dx + dy * dy + dz * dz),
        spacing * NEAREST,
      )
      const force = reach / (distance * distance * distance)
      push(i, dx * force, dy * force, dz * force)
      push(j, -dx * force, -dy * force, -dz * force)
    }
  }
}

function attract(
  points: readonly Point[],
  links: readonly { source: number; target: number }[],
  tuning: LayoutTuning,
  push: Push,
): void {
  for (const { source, target } of links) {
    const a = points[source]
    const b = points[target]
    if (a === undefined || b === undefined) continue
    const dx = b.x - a.x
    const dy = b.y - a.y
    const dz = b.z - a.z
    const length = Math.hypot(dx, dy, dz) || 1
    const force = (tuning.spring * (length - tuning.spacing)) / length
    push(source, dx * force, dy * force, dz * force)
    push(target, -dx * force, -dy * force, -dz * force)
  }
}

/** Where each node sits once the whole network has settled: linked members
 * close, everyone else apart. The same input always gives the same points,
 * so the replay grows into one shape (R-NET-1). */
export function layout(
  count: number,
  links: readonly { source: number; target: number }[],
  tuning: LayoutTuning = layoutDefaults,
): Point[] {
  const points = startingPoints(count, tuning)
  const moves = points.map(() => ({ x: 0, y: 0, z: 0 }))
  const push: Push = (index, dx, dy, dz) => {
    const move = moves[index] as Point
    move.x += dx
    move.y += dy
    move.z += dz
  }
  for (let step = 0; step < tuning.iterations; step++) {
    const heat = tuning.spacing * (1 - step / tuning.iterations)
    for (const move of moves) Object.assign(move, { x: 0, y: 0, z: 0 })
    repel(points, tuning.spacing, push)
    attract(points, links, tuning, push)
    points.forEach((point, index) => {
      const move = moves[index] as Point
      move.x -= point.x * tuning.gravity
      move.y -= point.y * tuning.gravity
      move.z -= point.z * tuning.gravity
      const length = Math.hypot(move.x, move.y, move.z) || 1
      const scale = Math.min(length, heat) / length
      point.x += move.x * scale
      point.y += move.y * scale
      point.z += move.z * scale
    })
  }
  return points
}
