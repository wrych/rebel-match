/** How one type of notification reaches a member (R-NOTE-2). */
export type Cadence =
  'immediately' | 'every_15_minutes' | 'hourly' | 'daily' | 'in_app' | 'off'

/** The types a member can choose for, as stored. */
export type ChoosableType =
  'connection_request' | 'new_connection' | 'trend_challenge' | 'applicant'

/** Until a member chooses (R-NOTE-2). */
export const DEFAULT_CADENCE: Readonly<Record<ChoosableType, Cadence>> = {
  connection_request: 'hourly',
  new_connection: 'hourly',
  trend_challenge: 'daily',
  applicant: 'every_15_minutes',
}

const EVERYONE: readonly Cadence[] = [
  'immediately',
  'hourly',
  'daily',
  'in_app',
  'off',
]

/** The options a type offers: the five, and for applicant notices every 15
 * minutes as well (R-NOTE-2). */
export function offeredCadences(type: ChoosableType): readonly Cadence[] {
  return type === 'applicant'
    ? ['immediately', 'every_15_minutes', ...EVERYONE.slice(1)]
    : EVERYONE
}

// The windows the options name, so fixed in code rather than configured
// (ADR 0037).
const WINDOW_MINUTES: Partial<Record<Cadence, number>> = {
  every_15_minutes: 15,
  hourly: 60,
}
const MS_PER_MINUTE = 60_000

/** When the daily mail goes out: a local time in a time zone. */
export interface DailyTime {
  dailyAt: string
  timeZone: string
}

// How far `timeZone` is ahead of UTC at `instant`, in milliseconds.
function offsetAt(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant))
  const part = (type: string): number =>
    Number(parts.find((each) => each.type === type)?.value)
  const local = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  )
  return local - Math.floor(instant / 1000) * 1000
}

// The instant the local `hh:mm` falls on, `days` local days after the local
// day of `instant`. Counted in calendar days, as a day is not always 24 hours.
function dayAt(instant: number, time: DailyTime, days: number): number {
  const [hours = 0, minutes = 0] = time.dailyAt.split(':').map(Number)
  const local = new Date(instant + offsetAt(instant, time.timeZone))
  const wall = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() + days,
    hours,
    minutes,
  )
  const guess = wall - offsetAt(wall, time.timeZone)
  return wall - offsetAt(guess, time.timeZone)
}

/** The first daily moment after `after` (R-NOTE-7). */
export function nextDaily(after: Date, time: DailyTime): Date {
  const today = dayAt(after.getTime(), time, 0)
  return new Date(
    today > after.getTime() ? today : dayAt(after.getTime(), time, 1),
  )
}

/** When a member's notifications on one cadence may be mailed, given the last
 * mail of that cadence and the oldest notification waiting; null for never
 * (R-NOTE-7). */
export function dueAt(
  cadence: Cadence,
  lastMailed: Date | null,
  oldest: Date,
  now: Date,
  daily: DailyTime,
): Date | null {
  if (cadence === 'in_app' || cadence === 'off') return null
  if (cadence === 'immediately') return now
  if (cadence === 'daily') {
    const since =
      lastMailed !== null && lastMailed > oldest ? lastMailed : oldest
    return nextDaily(since, daily)
  }
  const window = (WINDOW_MINUTES[cadence] ?? 0) * MS_PER_MINUTE
  return lastMailed === null ? now : new Date(lastMailed.getTime() + window)
}
