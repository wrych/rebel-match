import { bossJobs, type BossJob } from './tuning.js'

/** A job in the game: the five of boss mode, then Rebel (R-GAME-3). */
export type Job = BossJob | 'rebel'

/** Days played in each boss job before a promotion. */
export const DAYS_PER_JOB = 3

/** The last level of boss mode; rebel mode starts after it. */
export const LAST_BOSS_LEVEL = bossJobs.length * DAYS_PER_JOB

/** The first level of rebel mode. */
export const FIRST_REBEL_LEVEL = LAST_BOSS_LEVEL + 1

/** The job a level is played in: three days per boss job, then Rebel. */
export function jobOf(level: number): Job {
  if (level >= FIRST_REBEL_LEVEL) return 'rebel'
  return bossJobs[Math.floor((level - 1) / DAYS_PER_JOB)] ?? 'teamLead'
}

/** The first day of the job a level belongs to: where a loss sends the
 * player back to (R-GAME-7). */
export function firstDayOf(level: number): number {
  if (level >= FIRST_REBEL_LEVEL) return FIRST_REBEL_LEVEL
  return level - ((level - 1) % DAYS_PER_JOB)
}

/** The first day of every job up to the highest level reached, for playing
 * from (R-GAME-16). */
export function firstDaysUpTo(highest: number): number[] {
  const days: number[] = []
  for (let day = 1; day <= highest; day = nextJobStart(day)) days.push(day)
  return days
}

function nextJobStart(day: number): number {
  return day >= FIRST_REBEL_LEVEL
    ? Number.POSITIVE_INFINITY
    : day + DAYS_PER_JOB
}

/** How a day ended (R-GAME-14). */
export type Outcome = 'won' | 'lost' | 'abandoned'

/** A player's place in the game, as kept with their account (R-GAME-16). */
export interface Progress {
  /** The level being played. */
  currentLevel: number
  /** The highest level reached, and so playable. */
  highestLevel: number
  /** The highest level won, if any. */
  bestLevel: number | null
  /** The total play time when the best was first won. */
  bestSeconds: number | null
  /** Every second played, lost and abandoned days included. */
  totalSeconds: number
}

/** A day as the client reports it. */
export interface DayRecord {
  level: number
  outcome: Outcome
  playSeconds: number
}

export const newProgress: Progress = {
  currentLevel: 1,
  highestLevel: 1,
  bestLevel: null,
  bestSeconds: null,
  totalSeconds: 0,
}

/** Whether a day could have been played: a level reached, or one past it,
 * and from one second up to `longestSeconds` (R-GAME-20). */
export function plausible(
  progress: Progress,
  day: DayRecord,
  longestSeconds: number,
): boolean {
  return (
    Number.isInteger(day.level) &&
    day.level >= 1 &&
    day.level <= progress.highestLevel + 1 &&
    Number.isInteger(day.playSeconds) &&
    day.playSeconds >= 1 &&
    day.playSeconds <= longestSeconds
  )
}

/** The progress after a day: a win moves on and may set a new best, which
 * keeps the total from when it was first reached; a loss or an abandoned day
 * goes back to the first day of its job (R-GAME-7, R-GAME-16). */
export function progressAfter(progress: Progress, day: DayRecord): Progress {
  const totalSeconds = progress.totalSeconds + day.playSeconds
  if (day.outcome !== 'won')
    return { ...progress, currentLevel: firstDayOf(day.level), totalSeconds }
  const next = day.level + 1
  const newBest = progress.bestLevel === null || day.level > progress.bestLevel
  return {
    currentLevel: next,
    highestLevel: Math.max(progress.highestLevel, next),
    bestLevel: newBest ? day.level : progress.bestLevel,
    bestSeconds: newBest ? totalSeconds : progress.bestSeconds,
    totalSeconds,
  }
}
