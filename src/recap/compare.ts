/** The percent of active members with a lower count, rounded down to
 * `step`; null below `minMembers` or `minShare` (R-RECAP-3). `counts` are
 * the counts above zero, the member's own among them. */
export function shareBelow(
  mine: number,
  counts: readonly number[],
  members: number,
  rule: { step: number; minMembers: number; minShare: number },
): number | null {
  if (members < rule.minMembers || members === 0 || mine <= 0) return null
  const atOrAbove = counts.filter((count) => count >= mine).length
  const below = Math.max(members - Math.max(atOrAbove, 1), 0)
  const share = Math.floor(((below / members) * 100) / rule.step) * rule.step
  return share > 0 && share >= rule.minShare ? share : null
}
