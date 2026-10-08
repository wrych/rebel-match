import { FIRST_REBEL_LEVEL, jobOf } from '../../../src/game/levels'
import type { BossJob } from '../../../src/game/tuning'
import type { Tuning } from '../../../src/services/game'
import { floors, type Floor, type Spot } from './floors'
import { centreOf, path } from './grid'
import { mulberry32, pick } from './random'

export type { Tuning }

/** Boss mode crushes spirits; rebel mode, from level 16, lifts them. */
export type Mode = 'boss' | 'rebel'

/** An employee's spirit (R-GAME-4, R-GAME-9). */
export type Spirit = 'grey' | 'tempted' | 'rebel'

/** What an employee is doing, and where they are headed. */
export type Doing =
  | { kind: 'arriving'; from: number }
  | { kind: 'atDesk' }
  | { kind: 'toCooler'; cooler: number }
  | { kind: 'atCooler'; cooler: number; since: number }
  | { kind: 'toDesk' }
  | { kind: 'toMeeting' }
  | { kind: 'inMeeting' }
  | { kind: 'leaving'; seconds: number; then: 'break' | 'masterclass' }
  | { kind: 'away'; until: number; then: 'break' | 'masterclass' }

export interface Employee {
  id: number
  cubicle: number
  position: Spot
  /** Tile centres still to walk, nearest first. */
  route: Spot[]
  doing: Doing
  spirit: Spirit
  /** When the current temptation began (boss mode). */
  temptedAt: number
  /** Busy with a file until then; no temptation meanwhile (boss mode). */
  workingUntil: number
  /** 0 cool, 1 warm, 2 hot, 3 boiling (rebel mode). */
  heat: number
  /** When the heat last rose, or the file landed. */
  heatAt: number
  /** A file waits on their desk: one landed in rebel mode, or one the boss
   * left in boss mode. */
  file: boolean
}

/** Something the player is busy with, standing still meanwhile. */
export interface Busy {
  kind: 'meeting' | 'speech' | 'talk' | 'help'
  until: number
  /** The employee helped or talked to, or the cooler spoken at. */
  target?: number
  cooler?: number
}

export interface Player {
  position: Spot
  carrying: boolean
  busy: Busy | null
}

/** A day of 9toRevolution, everything `step` needs and nothing else. */
export interface DayState {
  mode: Mode
  level: number
  floor: BossJob
  tuning: Tuning
  /** Seconds since 09:00. */
  clock: number
  /** The random source's state. */
  seed: number
  player: Player
  employees: Employee[]
  /** When two first stood together at each cooler, if they still do. */
  chats: (number | null)[]
  meetingHeld: boolean
  masterclassHeld: boolean
  breakReadyAt: number
  nextFileAt: number
  outcome: 'won' | 'lost' | null
  /** Spirits crushed in boss mode, files helped with in rebel mode. */
  score: number
}

/** How fast people walk, how far the player reaches, and how much room a
 * body takes, in tiles and seconds. */
export const PLAYER_SPEED = 4
export const EMPLOYEE_SPEED = 2.5
export const REACH = 1.5
export const BODY_RADIUS = 0.3
const MS_PER_SECOND = 1000

/** The stages of heat in rebel mode; past boiling an employee turns grey. */
export const HEAT = { cool: 0, warm: 1, hot: 2, boiling: 3 } as const

/** The floor a level is played on (R-GAME-2). */
export function floorOf(level: number): BossJob {
  const job = jobOf(level)
  return job === 'rebel' ? 'ceo' : job
}

export const floorFor = (state: DayState): Floor => floors[state.floor]

/** How many people work on the day's floor. */
export function staffOf(level: number, tuning: Tuning): number {
  return tuning[`${floorOf(level)}.employees`]
}

function drawDistinct(
  seed: number,
  count: number,
  below: number,
): [Set<number>, number] {
  const chosen = new Set<number>()
  let state = seed
  while (chosen.size < Math.min(count, below)) {
    const [value, next] = mulberry32.next(state)
    state = next
    chosen.add(pick(value, below))
  }
  return [chosen, state]
}

function arriving(
  floor: Floor,
  id: number,
  spirit: Spirit,
  gapSeconds: number,
): Employee {
  const cubicle = floor.cubicles[id]
  const seat = cubicle?.seat ?? floor.entrance
  return {
    id,
    cubicle: id,
    position: centreOf(floor.entrance),
    route: path(floor, floor.entrance, seat).map(centreOf),
    doing: { kind: 'arriving', from: id * gapSeconds },
    spirit,
    temptedAt: 0,
    workingUntil: 0,
    heat: 0,
    heatAt: 0,
    file: false,
  }
}

/** The day at 09:00: everyone walking in, some already rebels in boss mode or
 * grey in rebel mode (R-GAME-3). */
export function startDay(
  level: number,
  tuning: Tuning,
  seed: number,
): DayState {
  const mode: Mode = level >= FIRST_REBEL_LEVEL ? 'rebel' : 'boss'
  const job = floorOf(level)
  const floor = floors[job]
  const staff = staffOf(level, tuning)
  const morning =
    mode === 'boss'
      ? tuning[`${job}.morningRebels`]
      : tuning['rebel.morningGrey']
  const [marked, next] = drawDistinct(seed, morning, staff)
  const odd: Spirit = mode === 'boss' ? 'rebel' : 'grey'
  const usual: Spirit = mode === 'boss' ? 'grey' : 'rebel'
  return {
    mode,
    level,
    floor: job,
    tuning: Object.freeze({ ...tuning }),
    clock: 0,
    seed: next,
    player: { position: centreOf(floor.start), carrying: false, busy: null },
    employees: Array.from({ length: staff }, (_, id) =>
      arriving(
        floor,
        id,
        marked.has(id) ? odd : usual,
        tuning.arrivalGapMs / MS_PER_SECOND,
      ),
    ),
    chats: floor.coolers.map(() => null),
    meetingHeld: false,
    masterclassHeld: false,
    breakReadyAt: 0,
    nextFileAt: tuning['rebel.fileEverySeconds'],
    outcome: null,
    score: 0,
  }
}

/** The day's coolers in use: as many as the tuning allows on this floor. */
export function coolersOf(state: DayState): number {
  return Math.min(
    floorFor(state).coolers.length,
    state.tuning[`${state.floor}.coolers`],
  )
}

/** Draws the next random number from the day's source. */
export function draw(state: DayState): number {
  const [value, next] = mulberry32.next(state.seed)
  state.seed = next
  return value
}
