import type { Recap, RecapRow } from '../../src/services/recap'
import { findJson } from './request'

export type { Recap, RecapRow }

/** The member's own recap, or null while hosts have it closed (R-RECAP-1). */
export async function fetchRecap(): Promise<Recap | null> {
  return findJson<Recap>('/api/recap', 'recap unavailable')
}

export { recapOpen } from '../../src/recap/open'
