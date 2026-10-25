import type { Recap, RecapRow } from '../../src/services/recap'
import { findJson } from './request'

export type { Recap, RecapRow }

/** The member's own recap, or null while hosts have it closed (R-RECAP-1). */
export async function fetchRecap(): Promise<Recap | null> {
  return findJson<Recap>('/api/recap', 'recap unavailable')
}

/** Whether the menu offers the recap: hosts have opened it (R-RECAP-1). */
export function recapOpen(recap: number): boolean {
  return recap === 1
}
