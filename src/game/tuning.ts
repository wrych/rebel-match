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

interface Bounds {
  min: number
  max: number
}

interface Tuning {
  value: number
  bounds: Bounds
}

const tuned = (value: number, bounds: Bounds): Tuning => ({ value, bounds })

const range = (max: number, min = 0): Bounds => ({ min, max })

const SECONDS: Bounds = { min: 1, max: 600 }
const SHORT_SECONDS: Bounds = { min: 1, max: 60 }

const perJob = <N extends PerJob>(
  name: N,
  of: (job: BossJob) => Tuning,
): Record<`${BossJob}.${N}`, Tuning> =>
  Object.fromEntries(
    bossJobs.map((job) => [`${job}.${name}`, of(job)]),
  ) as Record<`${BossJob}.${N}`, Tuning>

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
const morningRebels: Readonly<Record<BossJob, number>> = {
  teamLead: 1,
  manager: 1,
  director: 2,
  vp: 3,
  ceo: 5,
}
const temptationEverySeconds: Readonly<Record<BossJob, number>> = {
  teamLead: 12,
  manager: 9,
  director: 7,
  vp: 5,
  ceo: 4,
}
const temptedGraceSeconds: Readonly<Record<BossJob, number>> = {
  teamLead: 20,
  manager: 16,
  director: 14,
  vp: 12,
  ceo: 10,
}

// Each number's starting value, a first guess tuned in the pilot
// (`specs/design.md`, The 9toRevolution game), and what a host may set it to:
// within what a floor holds, and short of a day no phone can finish.
const tuning = {
  enabled: tuned(0, range(1)),
  dayLengthSeconds: tuned(90, { min: 30, max: 600 }),
  fileWorkSeconds: tuned(15, SECONDS),
  coolerVisitEverySeconds: tuned(20, SECONDS),
  coolerChatSeconds: tuned(6, SHORT_SECONDS),
  speechSeconds: tuned(2, SHORT_SECONDS),
  meetingSeconds: tuned(8, SHORT_SECONDS),
  arrivalGapMs: tuned(600, { min: 0, max: 5000 }),
  quietStartSeconds: tuned(8, { min: 0, max: 120 }),
  rampStartPercent: tuned(50, { min: 0, max: 100 }),
  rampEndPercent: tuned(150, { min: 100, max: 400 }),
  coolerLoneWaitSeconds: tuned(12, SECONDS),
  doorOpenSeconds: tuned(25, SECONDS),
  'rebel.masterclassSeats': tuned(2, range(4, 1)),
  'rebel.morningGrey': tuned(3, range(Math.floor(cubicles.ceo / 2))),
  'rebel.fileEverySeconds': tuned(10, SECONDS),
  'rebel.fileStepPercent': tuned(8, range(50)),
  'rebel.fileFloorSeconds': tuned(3, SECONDS),
  'rebel.heatStageSeconds': tuned(6, SHORT_SECONDS),
  'rebel.helpSeconds': tuned(2, SHORT_SECONDS),
  'rebel.breakSeconds': tuned(15, SHORT_SECONDS),
  'rebel.breakCooldownSeconds': tuned(20, SECONDS),
  'rebel.talkSeconds': tuned(4, SHORT_SECONDS),
  'rebel.masterclassSeconds': tuned(8, SHORT_SECONDS),
  ...perJob('employees', (job) =>
    tuned(cubicles[job], range(cubicles[job], 2)),
  ),
  ...perJob('coolers', (job) =>
    tuned(coolerSpots[job], range(coolerSpots[job])),
  ),
  ...perJob('morningRebels', (job) =>
    tuned(morningRebels[job], range(Math.floor(cubicles[job] / 2))),
  ),
  ...perJob('temptationEverySeconds', (job) =>
    tuned(temptationEverySeconds[job], SECONDS),
  ),
  ...perJob('temptedGraceSeconds', (job) =>
    tuned(temptedGraceSeconds[job], SECONDS),
  ),
  'manager.meetingSeats': tuned(2, range(cubicles.manager, 1)),
  'director.meetingSeats': tuned(3, range(cubicles.director, 1)),
  'vp.meetingSeats': tuned(4, range(cubicles.vp, 1)),
  'ceo.meetingSeats': tuned(5, range(cubicles.ceo, 1)),
}

/** A number hosts tune for the game (R-GAME-17, ADR 0045). */
export type GameKey = keyof typeof tuning

/** The game's tuning, keyed as the settings screen names it. */
export type GameSettings = Readonly<Record<GameKey, number>>

const tuningOf = <T>(of: (entry: Tuning) => T): Readonly<Record<GameKey, T>> =>
  Object.fromEntries(
    Object.entries(tuning).map(([key, entry]) => [key, of(entry)]),
  ) as Record<GameKey, T>

/** The values the game starts from: a first guess, tuned in the pilot
 * (`specs/design.md`, The 9toRevolution game). */
export const gameDefaults: GameSettings = tuningOf((entry) => entry.value)

/** What a host may set each number to: within what a floor holds, and short
 * of a day no phone can finish (R-GAME-17). */
export const gameBounds: Readonly<Record<GameKey, Bounds>> = tuningOf(
  (entry) => entry.bounds,
)

/** Pairs where the first must stay at or below the second. */
export const gameOrder: readonly (readonly [GameKey, GameKey])[] = [
  ['rebel.fileFloorSeconds', 'rebel.fileEverySeconds'],
  ['rebel.morningGrey', 'ceo.employees'],
  ['quietStartSeconds', 'dayLengthSeconds'],
  ...bossJobs.map(
    (job) => [`${job}.morningRebels`, `${job}.employees`] as const,
  ),
]

export function isGameKey(key: string): key is GameKey {
  return Object.hasOwn(gameBounds, key)
}
