import { endMeeting } from './boss'
import { breakUp, standing } from './cooler'
import { workOn } from './files'
import { centreOf, distance } from './grid'
import { rekindle, sendAway } from './rebel'
import {
  HEAT,
  REACH,
  coolersOf,
  floorFor,
  type Busy,
  type DayState,
  type Employee,
} from './state'
import { present } from './walk'
import type { Spot } from './floors'

/** What the action button can do (R-GAME-12). */
export type ActionKind =
  | 'takeFile'
  | 'assign'
  | 'leaveFile'
  | 'breakUp'
  | 'help'
  | 'break'
  | 'talk'
  | 'masterclass'

/** An action the player can take where they stand, and on whom. */
export interface Action {
  kind: ActionKind
  /** The employee it is for. */
  target?: number
  /** The cooler it is at. */
  cooler?: number
}

const near = (state: DayState, spot: Spot): boolean =>
  distance(state.player.position, spot) <= REACH

const atOwnDesk = (state: DayState): boolean =>
  floorFor(state).desk.some((tile) => near(state, centreOf(tile)))

function nearest(
  state: DayState,
  candidates: Employee[],
  where: (employee: Employee) => Spot = (employee) => employee.position,
): Employee | undefined {
  return candidates
    .filter((employee) => near(state, where(employee)))
    .sort(
      (a, b) =>
        distance(state.player.position, where(a)) -
        distance(state.player.position, where(b)),
    )[0]
}

function coolerOf(employee: Employee): number | undefined {
  return employee.doing.kind === 'atCooler' ? employee.doing.cooler : undefined
}

function nearCooler(state: DayState): number | undefined {
  const floor = floorFor(state)
  for (let cooler = 0; cooler < coolersOf(state); cooler += 1) {
    const spot = floor.coolers[cooler]?.cooler
    if (spot !== undefined && near(state, centreOf(spot))) return cooler
  }
  return undefined
}

const reachable = (employee: Employee): boolean =>
  employee.doing.kind === 'atDesk' || employee.doing.kind === 'atCooler'

function deskOf(state: DayState, employee: Employee): Spot {
  const desk = floorFor(state).cubicles[employee.cubicle]?.desk
  return desk === undefined ? employee.position : centreOf(desk)
}

// A desk its employee is away from, with no file on it yet.
const emptyDesk = (employee: Employee): boolean =>
  employee.doing.kind !== 'atDesk' && !employee.file

function fileActions(state: DayState): Action[] {
  const actions: Action[] = []
  const target = nearest(
    state,
    state.employees.filter((e) => reachable(e) && e.spirit !== 'grey'),
  )
  if (target !== undefined) actions.push({ kind: 'assign', target: target.id })
  const desk = nearest(state, state.employees.filter(emptyDesk), (e) =>
    deskOf(state, e),
  )
  if (desk !== undefined) actions.push({ kind: 'leaveFile', target: desk.id })
  return actions
}

function bossActions(state: DayState): Action[] {
  const { carrying } = state.player
  const actions: Action[] = carrying ? fileActions(state) : []
  if (!carrying && atOwnDesk(state)) actions.push({ kind: 'takeFile' })
  const cooler = nearCooler(state)
  if (cooler !== undefined && standing(state, cooler).length > 0)
    actions.push({ kind: 'breakUp', cooler })
  return actions
}

function rebelActions(state: DayState): Action[] {
  const actions: Action[] = []
  const filed = nearest(
    state,
    state.employees.filter((e) => e.file),
    (e) => deskOf(state, e),
  )
  if (filed !== undefined) actions.push({ kind: 'help', target: filed.id })
  const restless = nearest(
    state,
    state.employees.filter(
      (e) => e.spirit === 'rebel' && e.doing.kind === 'atDesk',
    ),
  )
  if (restless !== undefined && state.clock >= state.breakReadyAt)
    actions.push({ kind: 'break', target: restless.id })
  const grey = nearest(
    state,
    state.employees.filter((e) => e.spirit === 'grey' && reachable(e)),
  )
  if (grey !== undefined) {
    const cooler = coolerOf(grey)
    actions.push({
      kind: 'talk',
      target: grey.id,
      ...(cooler === undefined ? {} : { cooler }),
    })
  }
  const anyGrey = state.employees.some((e) => e.spirit === 'grey' && present(e))
  if (!state.masterclassHeld && anyGrey && atOwnDesk(state))
    actions.push({ kind: 'masterclass' })
  return actions
}

/** What the player can do where they stand; two at once open as a choice
 * (R-GAME-12). Nothing while they are busy. */
export function availableActions(state: DayState): Action[] {
  if (state.player.busy !== null || state.outcome !== null) return []
  return state.mode === 'boss' ? bossActions(state) : rebelActions(state)
}

function assign(state: DayState, employee: Employee): void {
  state.player.carrying = false
  const cooler = coolerOf(employee)
  if (cooler !== undefined) breakUp(state, cooler)
  workOn(state, employee)
}

function busy(
  state: DayState,
  kind: 'speech' | 'talk' | 'help',
  seconds: number,
  action: Action,
): void {
  state.player.busy = {
    kind,
    until: state.clock + seconds,
    ...(action.target === undefined ? {} : { target: action.target }),
    ...(action.cooler === undefined ? {} : { cooler: action.cooler }),
  }
}

function masterclass(state: DayState, chosen: readonly number[]): void {
  const greys = state.employees.filter(
    (e) => chosen.includes(e.id) && e.spirit === 'grey' && present(e),
  )
  if (greys.length === 0) return
  for (const employee of greys.slice(0, state.tuning['rebel.masterclassSeats']))
    sendAway(state, employee, 'masterclass')
  state.masterclassHeld = true
}

type Handler = (
  state: DayState,
  action: Action,
  chosen: readonly number[],
) => void

const targetOf = (state: DayState, action: Action): Employee | undefined =>
  state.employees.find((e) => e.id === action.target)

const handlers: Readonly<Record<ActionKind, Handler>> = {
  takeFile: (state) => {
    state.player.carrying = true
  },
  assign: (state, action) => {
    const target = targetOf(state, action)
    if (target !== undefined) assign(state, target)
  },
  leaveFile: (state, action) => {
    const target = targetOf(state, action)
    if (target === undefined) return
    state.player.carrying = false
    target.file = true
  },
  breakUp: (state, action) => {
    busy(state, 'speech', state.tuning.speechSeconds, action)
  },
  help: (state, action) => {
    busy(state, 'help', state.tuning['rebel.helpSeconds'], action)
  },
  talk: (state, action) => {
    busy(state, 'talk', state.tuning['rebel.talkSeconds'], action)
  },
  break: (state, action) => {
    const target = targetOf(state, action)
    if (target !== undefined) sendAway(state, target, 'break')
    state.breakReadyAt =
      state.clock + state.tuning['rebel.breakCooldownSeconds']
  },
  masterclass: (state, _action, chosen) => {
    masterclass(state, chosen)
  },
}

/** Does `kind`, if the player can where they stand; `chosen` names the two
 * employees sent to a masterclass. */
export function act(
  state: DayState,
  kind: ActionKind,
  chosen: readonly number[] = [],
): void {
  const action = availableActions(state).find((a) => a.kind === kind)
  if (action !== undefined) handlers[kind](state, action, chosen)
}

function talkedTo(state: DayState, target: number, cooler?: number): void {
  if (cooler === undefined) {
    const employee = state.employees.find((e) => e.id === target)
    if (employee?.spirit === 'grey') rekindle(employee, state.clock)
    return
  }
  const there = standing(state, cooler)
  const grey = there.find((e) => e.spirit === 'grey')
  if (grey !== undefined) rekindle(grey, state.clock)
  for (const employee of there) employee.heat = HEAT.cool
}

function helped(state: DayState, target: number | undefined): void {
  const employee = state.employees.find((e) => e.id === target)
  if (employee?.file !== true) return
  employee.file = false
  state.score += 1
}

const finishers: Readonly<
  Record<Busy['kind'], (state: DayState, spell: Busy) => void>
> = {
  meeting: (state) => {
    endMeeting(state)
  },
  speech: (state, spell) => {
    if (spell.cooler !== undefined) breakUp(state, spell.cooler)
  },
  talk: (state, spell) => {
    if (spell.target !== undefined) talkedTo(state, spell.target, spell.cooler)
  },
  help: (state, spell) => {
    helped(state, spell.target)
  },
}

/** What a busy spell achieves once it is over. */
export function finish(state: DayState): void {
  const spell = state.player.busy
  if (spell === null || state.clock < spell.until) return
  state.player.busy = null
  finishers[spell.kind](state, spell)
}
