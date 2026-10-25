/** How a member's count compares with everyone's: the share of active
 * members whose count is lower, in percent, rounded down to `step`; null
 * while too few are active to say it without pointing at anyone, or when
 * nobody is below (R-RECAP-3). `counts` are the active members' counts above
 * zero, the member's own among them; everyone else counts zero. */
export function shareBelow(
  mine: number,
  counts: readonly number[],
  members: number,
  rule: { step: number; minMembers: number },
): number | null {
  if (members < rule.minMembers || members === 0 || mine <= 0) return null
  const atOrAbove = counts.filter((count) => count >= mine).length
  const below = Math.max(members - Math.max(atOrAbove, 1), 0)
  const share = Math.floor(((below / members) * 100) / rule.step) * rule.step
  return share > 0 ? share : null
}
