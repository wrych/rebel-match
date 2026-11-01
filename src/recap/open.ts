const MS_PER_MINUTE = 60_000

/** Whether the recap is open: switched on, or past the opening time hosts
 * set, held in whole minutes since 1970 in UTC, 0 for none (R-RECAP-1,
 * R-RECAP-8). */
export function recapOpen(
  limits: { recap: number; recapOpensAt: number },
  now: number,
): boolean {
  if (limits.recap === 1) return true
  return limits.recapOpensAt > 0 && now >= limits.recapOpensAt * MS_PER_MINUTE
}
