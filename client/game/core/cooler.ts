import { pick } from './random'
import {
  HEAT,
  coolersOf,
  draw,
  floorFor,
  type DayState,
  type Employee,
} from './state'
import { sendTo, sendToDesk } from './walk'

/** Who is at, or on the way to, a cooler. */
export function visitors(state: DayState, cooler: number): Employee[] {
  return state.employees.filter(
    (employee) =>
      (employee.doing.kind === 'atCooler' ||
        employee.doing.kind === 'toCooler') &&
      employee.doing.cooler === cooler,
  )
}

/** Who stands at a cooler now. */
export function standing(state: DayState, cooler: number): Employee[] {
  return state.employees.filter(
    (employee) =>
      employee.doing.kind === 'atCooler' && employee.doing.cooler === cooler,
  )
}

/** Sends everyone at a cooler back to their desks, ending the chat. */
export function breakUp(state: DayState, cooler: number): void {
  for (const employee of visitors(state, cooler)) sendToDesk(state, employee)
  state.chats[cooler] = null
}

function idleAtDesk(state: DayState, employee: Employee): boolean {
  return (
    employee.doing.kind === 'atDesk' &&
    employee.workingUntil <= state.clock &&
    !employee.file
  )
}

// In rebel mode a grey employee opens a chat, and anyone may join them
// (R-GAME-11); in boss mode anyone goes (R-GAME-5).
function opensChat(
  state: DayState,
  employee: Employee,
  there: readonly Employee[],
): boolean {
  return state.mode === 'boss' || there.length > 0 || employee.spirit === 'grey'
}

// On average once every `coolerVisitEverySeconds` someone at their desk walks
// to a cooler with room, at most two to a cooler (R-GAME-5, R-GAME-11).
function maybeVisit(state: DayState, dt: number): void {
  const count = coolersOf(state)
  if (count === 0) return
  if (draw(state) >= dt / state.tuning.coolerVisitEverySeconds) return
  const cooler = pick(draw(state), count)
  const there = visitors(state, cooler)
  const spot = floorFor(state).coolers[cooler]?.stands[there.length]
  const idle = state.employees.filter(
    (employee) =>
      idleAtDesk(state, employee) && opensChat(state, employee, there),
  )
  if (spot === undefined || idle.length === 0) return
  const walker = idle[pick(draw(state), idle.length)]
  if (walker !== undefined)
    sendTo(state, walker, spot, { kind: 'toCooler', cooler })
}

function bossChatEnds(pair: Employee[], clock: number): void {
  const rebel = pair.some((employee) => employee.spirit === 'rebel')
  for (const employee of pair) {
    if (rebel && employee.spirit === 'grey') {
      employee.spirit = 'tempted'
      employee.temptedAt = clock
    }
  }
}

function rebelChatStarts(pair: Employee[], clock: number): void {
  if (!pair.some((employee) => employee.spirit === 'grey')) return
  for (const employee of pair) {
    if (employee.spirit !== 'rebel' || employee.heat >= HEAT.hot) continue
    employee.heat = HEAT.hot
    employee.heatAt = clock
  }
}

// Two at a cooler chat. In boss mode a rebel tempts the grey one when the chat
// ends; in rebel mode a grey one stresses the rebel as soon as they meet
// (R-GAME-5, R-GAME-11).
function chat(state: DayState, cooler: number): void {
  const there = standing(state, cooler)
  const since = state.chats[cooler] ?? null
  const chatSeconds = state.tuning.coolerChatSeconds
  if (there.length < 2) {
    state.chats[cooler] = null
    const alone = there[0]
    if (
      alone?.doing.kind === 'atCooler' &&
      state.clock - alone.doing.since > state.tuning.coolerLoneWaitSeconds
    )
      breakUp(state, cooler)
    return
  }
  if (since === null) {
    state.chats[cooler] = state.clock
    if (state.mode === 'rebel') rebelChatStarts(there, state.clock)
    return
  }
  if (state.clock - since < chatSeconds) return
  if (state.mode === 'boss') bossChatEnds(there, state.clock)
  breakUp(state, cooler)
}

/** The coolers' part of a step: new visits, and the chats under way. */
export function coolers(state: DayState, dt: number): void {
  maybeVisit(state, dt)
  for (let cooler = 0; cooler < coolersOf(state); cooler += 1)
    chat(state, cooler)
}
