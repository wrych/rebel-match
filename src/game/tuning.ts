/** The five jobs of boss mode, in order of promotion (R-GAME-3). */
export const bossJobs = [
  'teamLead',
  'manager',
  'director',
  'vp',
  'ceo',
] as const

export type BossJob = (typeof bossJobs)[number]

/** The jobs that hold meetings: every one but the first (R-GAME-6). */
export type MeetingJob = Exclude<BossJob, 'teamLead'>

type PerJob =
  | 'employees'
  | 'coolers'
  | 'morningRebels'
  | 'temptationEverySeconds'
  | 'temptedGraceSeconds'

/** A number hosts tune for the game (R-GAME-17, ADR 0045). */
export type GameKey =
  | 'enabled'
  | 'dayLengthSeconds'
  | 'fileWorkSeconds'
  | 'coolerVisitEverySeconds'
  | 'coolerChatSeconds'
  | 'speechSeconds'
  | 'meetingSeconds'
  | 'rebel.morningGrey'
  | 'rebel.fileEverySeconds'
  | 'rebel.fileStepPercent'
  | 'rebel.fileFloorSeconds'
  | 'rebel.heatStageSeconds'
  | 'rebel.helpSeconds'
  | 'rebel.breakSeconds'
  | 'rebel.breakCooldownSeconds'
  | 'rebel.talkSeconds'
  | 'rebel.masterclassSeconds'
  | `${BossJob}.${PerJob}`
  | `${MeetingJob}.meetingSeats`

/** The game's tuning, keyed as the settings screen names it. */
export type GameSettings = Readonly<Record<GameKey, number>>

interface Bounds {
  min: number
  max: number
}

const perJob = <T>(
  values: Readonly<Record<BossJob, T>>,
  name: PerJob,
): Record<`${BossJob}.${PerJob}`, T> =>
  Object.fromEntries(
    bossJobs.map((job) => [`${job}.${name}`, values[job]]),
  ) as Record<`${BossJob}.${PerJob}`, T>

// The floor plans hold this many cubicles and cooler spots; a host can staff
// a floor more thinly, never beyond what it holds.
const cubicles: Readonly<Record<BossJob, number>> = {
  teamLead: 4,
  manager: 8,
  director: 14,
  vp: 22,
  ceo: 32,
}
const coolerSpots: Readonly<Record<BossJob, number>> = {
  teamLead: 0,
  manager: 1,
  director: 1,
  vp: 2,
  ceo: 2,
}

/** The values the game starts from: a first guess, tuned in the pilot
 * (`specs/design.md`, The 9toRevolution game). */
export const gameDefaults: GameSettings = {
  enabled: 0,
  dayLengthSeconds: 90,
  fileWorkSeconds: 15,
  coolerVisitEverySeconds: 20,
  coolerChatSeconds: 6,
  speechSeconds: 2,
  meetingSeconds: 8,
  'rebel.morningGrey': 3,
  'rebel.fileEverySeconds': 10,
  'rebel.fileStepPercent': 8,
  'rebel.fileFloorSeconds': 3,
  'rebel.heatStageSeconds': 6,
  'rebel.helpSeconds': 2,
  'rebel.breakSeconds': 15,
  'rebel.breakCooldownSeconds': 20,
  'rebel.talkSeconds': 4,
  'rebel.masterclassSeconds': 8,
  ...perJob(cubicles, 'employees'),
  ...perJob(coolerSpots, 'coolers'),
  ...perJob(
    { teamLead: 1, manager: 1, director: 2, vp: 3, ceo: 5 },
    'morningRebels',
  ),
  ...perJob(
    { teamLead: 12, manager: 9, director: 7, vp: 5, ceo: 4 },
    'temptationEverySeconds',
  ),
  ...perJob(
    { teamLead: 20, manager: 16, director: 14, vp: 12, ceo: 10 },
    'temptedGraceSeconds',
  ),
  'manager.meetingSeats': 2,
  'director.meetingSeats': 3,
  'vp.meetingSeats': 4,
  'ceo.meetingSeats': 5,
}

const SECONDS: Bounds = { min: 1, max: 600 }
const SHORT_SECONDS: Bounds = { min: 1, max: 60 }

const range = (max: number, min = 0): Bounds => ({ min, max })

const perJobBounds = (
  name: PerJob,
  of: (job: BossJob) => Bounds,
): Record<`${BossJob}.${PerJob}`, Bounds> =>
  Object.fromEntries(
    bossJobs.map((job) => [`${job}.${name}`, of(job)]),
  ) as Record<`${BossJob}.${PerJob}`, Bounds>

/** What a host may set each number to: within what a floor holds, and short
 * of a day no phone can finish (R-GAME-17). */
export const gameBounds: Readonly<Record<GameKey, Bounds>> = {
  enabled: range(1),
  dayLengthSeconds: { min: 30, max: 600 },
  fileWorkSeconds: SECONDS,
  coolerVisitEverySeconds: SECONDS,
  coolerChatSeconds: SHORT_SECONDS,
  speechSeconds: SHORT_SECONDS,
  meetingSeconds: SHORT_SECONDS,
  'rebel.morningGrey': range(Math.floor(cubicles.ceo / 2)),
  'rebel.fileEverySeconds': SECONDS,
  'rebel.fileStepPercent': range(50),
  'rebel.fileFloorSeconds': SECONDS,
  'rebel.heatStageSeconds': SHORT_SECONDS,
  'rebel.helpSeconds': SHORT_SECONDS,
  'rebel.breakSeconds': SHORT_SECONDS,
  'rebel.breakCooldownSeconds': SECONDS,
  'rebel.talkSeconds': SHORT_SECONDS,
  'rebel.masterclassSeconds': SHORT_SECONDS,
  ...perJobBounds('employees', (job) => range(cubicles[job], 2)),
  ...perJobBounds('coolers', (job) => range(coolerSpots[job])),
  ...perJobBounds('morningRebels', (job) =>
    range(Math.floor(cubicles[job] / 2)),
  ),
  ...perJobBounds('temptationEverySeconds', () => SECONDS),
  ...perJobBounds('temptedGraceSeconds', () => SECONDS),
  'manager.meetingSeats': range(cubicles.manager, 1),
  'director.meetingSeats': range(cubicles.director, 1),
  'vp.meetingSeats': range(cubicles.vp, 1),
  'ceo.meetingSeats': range(cubicles.ceo, 1),
}

/** Pairs where the first must stay at or below the second. */
export const gameOrder: readonly (readonly [GameKey, GameKey])[] = [
  ['rebel.fileFloorSeconds', 'rebel.fileEverySeconds'],
  ['rebel.morningGrey', 'ceo.employees'],
  ...bossJobs.map(
    (job) => [`${job}.morningRebels`, `${job}.employees`] as const,
  ),
]

export function isGameKey(key: string): key is GameKey {
  return Object.hasOwn(gameBounds, key)
}
