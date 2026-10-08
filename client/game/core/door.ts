import type { Spot } from './floors'
import { BODY_RADIUS, draw, floorFor, type DayState } from './state'

/** How much of its swing the door makes in a second. */
const SWING_PER_SECOND = 1.5
/** Half the leaf's thickness, in tiles. */
export const LEAF_HALF = 0.06
/** How far a shut door's next wait varies either way, as a share of it. */
const WAIT_SPREAD = 0.5

/** The door's leaf, from its hinge to its far end, as open as `openness`. */
export function leafOf(
  state: DayState,
  openness = state.door.openness,
): [Spot, Spot] {
  const { hinge, length, shut, open } = floorFor(state).officeDoor
  const angle = shut + (open - shut) * openness
  return [
    hinge,
    {
      x: hinge.x + length * Math.cos(angle),
      y: hinge.y + length * Math.sin(angle),
    },
  ]
}

/** How far a spot is from the door's leaf. */
export function fromLeaf(
  state: DayState,
  at: Spot,
  openness = state.door.openness,
): number {
  const [a, b] = leafOf(state, openness)
  const along = { x: b.x - a.x, y: b.y - a.y }
  const share =
    ((at.x - a.x) * along.x + (at.y - a.y) * along.y) /
    (along.x ** 2 + along.y ** 2)
  const t = Math.min(1, Math.max(0, share))
  return Math.hypot(at.x - (a.x + t * along.x), at.y - (a.y + t * along.y))
}

/** Whether a body at `at` would touch the leaf as open as `openness`. */
export const touchesLeaf = (
  state: DayState,
  at: Spot,
  openness = state.door.openness,
): boolean => fromLeaf(state, at, openness) < BODY_RADIUS + LEAF_HALF

/** Opens the door, to shut by itself again some while later (R-GAME-21). */
export function openDoor(state: DayState): void {
  const spread = WAIT_SPREAD * (2 * draw(state) - 1)
  state.door.opening = true
  state.door.shutsAt = state.clock + state.tuning.doorOpenSeconds * (1 + spread)
}

/** Shuts the door once its time is up, and swings it towards open or shut,
 * standing still rather than pass through the player (R-GAME-21). */
export function swingDoor(state: DayState, dt: number): void {
  const door = state.door
  if (door.opening && state.clock >= door.shutsAt) door.opening = false
  const step = SWING_PER_SECOND * dt * (door.opening ? 1 : -1)
  const next = Math.min(1, Math.max(0, door.openness + step))
  if (next === door.openness) return
  if (touchesLeaf(state, state.player.position, next)) return
  door.openness = next
}
