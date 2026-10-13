import { act, finish, type ActionKind } from './actions'
import { bossRules } from './boss'
import { coolers } from './cooler'
import { fromLeaf, swingDoor, touchesLeaf } from './door'
import { inMeetingRoom, type Spot } from './floors'
import { distance, pointAlong, slide } from './grid'
import { rebelRules } from './rebel'
import {
  BODY_RADIUS,
  PLAYER_SPEED,
  floorFor,
  type DayState,
  type Employee,
} from './state'
import { walk } from './walk'

/** What the player does during a step: where the joystick or keys point,
 * each axis from -1 to 1, and an action if one was pressed (R-GAME-12). */
export interface Input {
  move: Spot
  act?: ActionKind
  /** The employees chosen for a masterclass. */
  chosen?: readonly number[]
}

export const idle: Input = { move: { x: 0, y: 0 } }

const onFloor = (employee: Employee): boolean =>
  employee.doing.kind !== 'away' &&
  !(employee.doing.kind === 'arriving' && employee.route.length > 0)

// Moving closer than a body's width to someone is refused, moving away is
// not, so the player is never stuck when someone walks into them.
function clearOfPeople(state: DayState, from: Spot, to: Spot): boolean {
  return state.employees.filter(onFloor).every((employee) => {
    const after = distance(to, employee.position)
    return (
      after >= 2 * BODY_RADIUS || after >= distance(from, employee.position)
    )
  })
}

// Like people, the door's leaf may be walked away from but not into.
const clearOfDoor = (state: DayState, from: Spot, to: Spot): boolean =>
  !touchesLeaf(state, to) || fromLeaf(state, to) >= fromLeaf(state, from)

// The meeting room's door stays shut but for a meeting, so the player only
// goes in to lead one (R-GAME-6).
const outsideMeetingRoom = (state: DayState, spot: Spot): boolean =>
  !inMeetingRoom(floorFor(state), spot.x, spot.y)

function stepAround(state: DayState, from: Spot, to: Spot): Spot {
  const options = [to, { x: to.x, y: from.y }, { x: from.x, y: to.y }]
  return (
    options.find(
      (spot) =>
        clearOfPeople(state, from, spot) &&
        clearOfDoor(state, from, spot) &&
        outsideMeetingRoom(state, spot),
    ) ?? from
  )
}

// A spell with a route walks the player along it, paced to end with it.
function followRoute(state: DayState): void {
  const spell = state.player.busy
  if (spell?.route === undefined || spell.since === undefined) return
  const share = (state.clock - spell.since) / (spell.until - spell.since)
  state.player.position = pointAlong(spell.route, share)
}

function movePlayer(state: DayState, move: Spot, dt: number): void {
  if (state.player.busy !== null) return
  const length = Math.hypot(move.x, move.y)
  if (length === 0) return
  const scale = (PLAYER_SPEED * dt) / Math.max(1, length)
  const floor = floorFor(state)
  const from = state.player.position
  const to = slide(
    floor,
    from,
    { x: move.x * scale, y: move.y * scale },
    BODY_RADIUS,
  )
  state.player.position = stepAround(state, from, to)
}

// More than half the office rebel in boss mode, or grey in rebel mode, loses
// the day at once; reaching 17:00 wins it (R-GAME-3, R-GAME-7).
function settle(state: DayState): void {
  const lost = state.mode === 'boss' ? 'rebel' : 'grey'
  const count = state.employees.filter((e) => e.spirit === lost).length
  if (count * 2 > state.employees.length) state.outcome = 'lost'
  else if (state.clock >= state.tuning.dayLengthSeconds) state.outcome = 'won'
}

/** The day `dt` seconds on: pure, so the same day, inputs and steps always
 * play out the same way. A finished day stays as it is. */
export function step(previous: DayState, input: Input, dt: number): DayState {
  if (previous.outcome !== null) return previous
  const { tuning, ...rest } = previous
  const state: DayState = { ...structuredClone(rest), tuning }
  state.clock = Math.min(state.clock + dt, state.tuning.dayLengthSeconds)
  followRoute(state)
  finish(state)
  movePlayer(state, input.move, dt)
  if (input.act !== undefined) act(state, input.act, input.chosen)
  swingDoor(state, dt)
  walk(state, dt)
  coolers(state, dt)
  if (state.mode === 'boss') bossRules(state, dt)
  else rebelRules(state)
  settle(state)
  return state
}
