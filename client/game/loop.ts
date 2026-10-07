import type { DayState } from './core/state'
import { step, type Input } from './core/step'

/** The game's fixed step, in seconds: thirty a second, whatever the screen's
 * refresh rate. */
export const STEP_SECONDS = 1 / 30

// A tab that hung for a while catches up this far and no further, rather than
// running minutes of the day in one frame.
const MAX_STEPS_PER_FRAME = 8

export interface Advanced {
  state: DayState
  /** Time not yet stepped, carried to the next frame. */
  carry: number
  /** Whether the input's action was used. */
  acted: boolean
}

/** Steps the day through a frame's time, the action going to the first step
 * only. */
export function advance(
  state: DayState,
  input: Input,
  elapsed: number,
  carry: number,
): Advanced {
  let budget = Math.min(carry + elapsed, MAX_STEPS_PER_FRAME * STEP_SECONDS)
  let next = state
  let acted = false
  while (budget >= STEP_SECONDS) {
    next = step(next, acted ? { move: input.move } : input, STEP_SECONDS)
    acted = acted || input.act !== undefined
    budget -= STEP_SECONDS
  }
  return { state: next, carry: budget, acted }
}
