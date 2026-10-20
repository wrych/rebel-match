/** A member's standing in a row: their count and when it reached it. */
export interface Standing {
  memberId: string
  count: number
  reachedAt: Date
}

/** Who holds a row's crown after a change: the one member with the highest
 * count of at least `minimum`, the holder keeping a tie, else whoever reached
 * that count first; nobody below the minimum (R-BADGE-3). */
export function crownAfter(
  holder: string | null,
  standings: readonly Standing[],
  minimum: number,
): string | null {
  const top = Math.max(0, ...standings.map((each) => each.count))
  if (top < minimum) return null
  const leaders = standings.filter((each) => each.count === top)
  if (leaders.some((each) => each.memberId === holder)) return holder
  const [first] = [...leaders].sort(
    (a, b) => a.reachedAt.getTime() - b.reachedAt.getTime(),
  )
  return first?.memberId ?? null
}
