import { distancesFrom, tileOf, walkingDistance } from './grid'
import { pick } from './random'
import { draw, floorFor, type DayState, type Employee } from './state'
import { present, sendTo, sendToDesk } from './walk'

function temptable(state: DayState, employee: Employee): boolean {
  return (
    employee.spirit === 'grey' &&
    employee.doing.kind === 'atDesk' &&
    employee.workingUntil <= state.clock
  )
}

// On average once every `temptationEverySeconds` a grey employee idle at their
// desk opens Corporate Rebels (R-GAME-4).
function maybeTempt(state: DayState, dt: number): void {
  const every = state.tuning[`${state.floor}.temptationEverySeconds`]
  if (draw(state) >= dt / every) return
  const idle = state.employees.filter((employee) => temptable(state, employee))
  const chosen = idle[pick(draw(state), idle.length)]
  if (chosen === undefined) return
  chosen.spirit = 'tempted'
  chosen.temptedAt = state.clock
}

// Left tempted past the grace time, an employee turns rebel (R-GAME-4).
function turnRebels(state: DayState): void {
  const grace = state.tuning[`${state.floor}.temptedGraceSeconds`]
  for (const employee of state.employees) {
    if (
      employee.spirit === 'tempted' &&
      state.clock - employee.temptedAt > grace
    )
      employee.spirit = 'rebel'
  }
}

/** Boss mode's part of a step (R-GAME-4). */
export function bossRules(state: DayState, dt: number): void {
  maybeTempt(state, dt)
  turnRebels(state)
}

/** Whether walking into the meeting room now starts a meeting (R-GAME-6). */
export function meetingDue(state: DayState): boolean {
  return (
    state.mode === 'boss' &&
    !state.meetingHeld &&
    state.floor !== 'teamLead' &&
    state.player.busy === null
  )
}

/** Starts the day's meeting: the employees nearest the meeting room walk in,
 * and the player stays for its length (R-GAME-6). */
export function startMeeting(state: DayState): void {
  if (state.floor === 'teamLead') return
  const floor = floorFor(state)
  const seats = state.tuning[`${state.floor}.meetingSeats`]
  const distances = distancesFrom(floor, floor.meetingDoor)
  const nearest = state.employees
    .filter(present)
    .map((employee) => ({
      employee,
      far: walkingDistance(distances, tileOf(employee.position)),
    }))
    .sort((a, b) => a.far - b.far || a.employee.id - b.employee.id)
    .slice(0, seats)
  nearest.forEach(({ employee }, index) => {
    const spot = floor.meetingSpots[index] ?? floor.meetingDoor
    sendTo(state, employee, spot, { kind: 'toMeeting' })
  })
  state.meetingHeld = true
  state.player.busy = {
    kind: 'meeting',
    until: state.clock + state.tuning.meetingSeconds,
  }
}

/** Ends the meeting: everyone who attended leaves it grey (R-GAME-6). */
export function endMeeting(state: DayState): void {
  for (const employee of state.employees) {
    const kind = employee.doing.kind
    if (kind !== 'toMeeting' && kind !== 'inMeeting') continue
    if (employee.spirit !== 'grey') state.score += 1
    employee.spirit = 'grey'
    sendToDesk(state, employee)
  }
}
