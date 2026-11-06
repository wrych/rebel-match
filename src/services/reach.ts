/** What reach is decided on, for one caller and one target member. */
export interface ReachFacts {
  isCaller: boolean
  /** Active and onboarded. */
  reachable: boolean
  findable: boolean
  searchOn: boolean
}

/** Whether a caller may see a member's card or send them a direct request:
 * never themselves, only an active, onboarded member, and only one search
 * would find. Fails closed (R-FIND-6, R-FIND-7, ADR 0062). */
export function canReach(facts: ReachFacts): boolean {
  return !facts.isCaller && facts.reachable && facts.searchOn && facts.findable
}
