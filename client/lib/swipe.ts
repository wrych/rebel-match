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
