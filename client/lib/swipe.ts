/** Which way a finger moved across a card: `1` for the next card (swiped
 * left), `-1` for the previous (swiped right), `0` for no swipe (R-OFF-1). */
export function swipeStep(
  from: { x: number; y: number },
  to: { x: number; y: number },
  minPx: number,
): -1 | 0 | 1 {
  const across = to.x - from.x
  const down = to.y - from.y
  if (Math.abs(across) < minPx || Math.abs(across) <= Math.abs(down)) return 0
  return across < 0 ? 1 : -1
}

/** How a deck card moves (R-OFF-1): the drag it waits for before choosing an
 * axis, its tilt per pixel and cap, how far the next card slides in from as a
 * share of the viewport, and each movement's duration. */
export const cardMotion = {
  axisLockPx: 8,
  tiltDegPerPx: 0.06,
  maxTiltDeg: 12,
  slideInShare: 0.4,
  flyOutMs: 220,
  slideInMs: 240,
  springBackMs: 200,
} as const

/** Where a card sits and how far it leans; at rest both are 0. */
export type CardPose = { x: number; rotateDeg: number }

/** Which axis a drag follows: `x` across the card, `y` a page scroll, or
 * `null` while the finger has moved less than `lockPx` either way. */
export function dragAxis(
  from: { x: number; y: number },
  to: { x: number; y: number },
  lockPx: number,
): 'x' | 'y' | null {
  const across = Math.abs(to.x - from.x)
  const down = Math.abs(to.y - from.y)
  if (Math.max(across, down) < lockPx) return null
  return across > down ? 'x' : 'y'
}

/** The pose of a card dragged `offsetX` pixels across: it follows the finger
 * and leans the same way, up to the tilt cap. */
export function cardPose(offsetX: number): CardPose {
  const lean = offsetX * cardMotion.tiltDegPerPx
  const rotateDeg = Math.max(
    -cardMotion.maxTiltDeg,
    Math.min(cardMotion.maxTiltDeg, lean),
  )
  return { x: offsetX, rotateDeg }
}

/** Where a card leaving for `step` flies to: out of a viewport `widthPx`
 * wide, the way the finger swiped. */
export function flyOutX(step: -1 | 1, widthPx: number): number {
  return -step * widthPx
}

/** Where the card arriving for `step` starts: on the side opposite the one
 * the last card left by. */
export function slideInX(step: -1 | 1, widthPx: number): number {
  return step * widthPx * cardMotion.slideInShare
}
