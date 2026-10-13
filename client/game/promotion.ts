import { firstDayOf, jobOf } from '../../src/game/levels'
import { bossJobs, type BossJob } from '../../src/game/tuning'
import type { Tuning } from './core/state'

/** A promotion as its panel shows it: the job, what changed, in the voice of
 * an HR memo, and the button's words (R-GAME-18). */
export interface Promotion {
  job: BossJob
  lines: string[]
  button: string
}

/** The button's words, one picked per day. */
export const PROMOTION_BUTTONS = [
  'To work',
  'Back to the grind',
  'Crush it',
  'Synergize',
  'Onward and upward',
  'Circle back to work',
  'Seize the KPIs',
  'Per my last email: go',
] as const

const seatsOf = (job: BossJob, tuning: Tuning): number =>
  job === 'teamLead' ? 0 : tuning[`${job}.meetingSeats`]

const more = (from: number, to: number): string =>
  to > from ? 'More' : 'Fewer'

function headcount(from: number, to: number): string {
  return `Headcount ${String(from)} → ${String(to)}. ${more(from, to)} people to keep busy.`
}

function coolers(from: number, to: number): string {
  if (from === 0 && to === 1)
    return 'Water cooler installed. A new hotbed of unrest.'
  return `Water coolers ${String(from)} → ${String(to)}. ${more(from, to)} hotbeds of unrest.`
}

function seats(from: number, to: number): string {
  if (from === 0)
    return `Meeting room unlocked: ${String(to)} seats. Align them before they align themselves.`
  const room = to - from === 1 ? 'Room for one more' : `${more(from, to)} room`
  return `Meeting seats ${String(from)} → ${String(to)}. ${room} on the agenda.`
}

function linesFrom(before: BossJob, job: BossJob, tuning: Tuning): string[] {
  const changes: [number, number, (from: number, to: number) => string][] = [
    [tuning[`${before}.employees`], tuning[`${job}.employees`], headcount],
    [tuning[`${before}.coolers`], tuning[`${job}.coolers`], coolers],
    [seatsOf(before, tuning), seatsOf(job, tuning), seats],
  ]
  return changes
    .filter(([from, to]) => from !== to)
    .map(([from, to, line]) => line(from, to))
}

/** The promotion to announce before a day, or null: due on the first day of
 * a boss job after Team Lead while it is the highest level reached, so a
 * retried first day announces it again (R-GAME-18). The day's seed picks the
 * button. */
export function promotionDue(
  level: number,
  highestLevel: number,
  tuning: Tuning,
  seed: number,
): Promotion | null {
  const job = jobOf(level)
  if (job === 'rebel' || level !== firstDayOf(level) || level !== highestLevel)
    return null
  const before = bossJobs[bossJobs.indexOf(job) - 1]
  if (before === undefined) return null
  return {
    job,
    lines: linesFrom(before, job, tuning),
    button:
      PROMOTION_BUTTONS[Math.abs(seed) % PROMOTION_BUTTONS.length] ?? 'To work',
  }
}
