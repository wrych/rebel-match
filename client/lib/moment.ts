const MS_PER_MINUTE = 60_000

const pad = (n: number): string => String(n).padStart(2, '0')

/** A moment setting, in whole minutes since 1970 in UTC, as a
 * `datetime-local` field shows it in the reader's own time zone; empty for
 * none (R-RECAP-8). */
export function localInputOf(minutes: number): string {
  if (minutes === 0) return ''
  const at = new Date(minutes * MS_PER_MINUTE)
  return (
    `${String(at.getFullYear())}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}` +
    `T${pad(at.getHours())}:${pad(at.getMinutes())}`
  )
}

/** What a `datetime-local` field holds, read in the reader's own time zone,
 * as whole minutes since 1970 in UTC; 0 for an empty field, null for one
 * that is not a moment. */
export function minutesOf(input: string): number | null {
  if (input.trim() === '') return 0
  const time = new Date(input).getTime()
  return Number.isNaN(time) ? null : Math.floor(time / MS_PER_MINUTE)
}
