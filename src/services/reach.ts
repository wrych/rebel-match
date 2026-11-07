/** What reach is decided on, for one caller and one target member. */
export interface ReachFacts {
  isCaller: boolean
  /** Active and onboarded. */
  reachable: boolean
  findable: boolean
  searchOn: boolean
  /** The caller presents the target's profile code, and it is on. */
  presentsCode: boolean
  codesOn: boolean
}

/** Whether a caller may see a member's card or send them a direct request:
 * never themselves, only an active, onboarded member, and only one search
 * would find or whose usable profile code the caller holds; a code that
 * merely exists never counts. Fails closed (R-FIND-6, R-FIND-7, R-CODE-3,
 * ADR 0062). */
export function canReach(facts: ReachFacts): boolean {
  if (facts.isCaller || !facts.reachable) return false
  const bySearch = facts.searchOn && facts.findable
  const byCode = facts.codesOn && facts.presentsCode
  return bySearch || byCode
}
