import type { Trend } from './challenges.js'

/** One of the member's own challenges with what it found (R-MINE-1). */
export interface CockpitChallenge {
  id: string
  body: string
  trend: { id: string; short: string } | null
  counts: { sameBoat: number; beenThere: number; cases: number }
}

export interface Cockpit {
  challenges: CockpitChallenge[]
  following: Trend[]
  /** Requests waiting for the member that arrived since they last opened
   * Matches (R-MINE-4). */
  pendingIncoming: number
  /** Accepted requests the member has not opened yet, made since they last
   * opened Matches (R-MINE-4, R-CONN-7,9). */
  newConnections: number
}

export interface CockpitStore {
  challenges(memberId: string): Promise<CockpitChallenge[]>
  pendingIncoming(memberId: string): Promise<number>
  newConnections(memberId: string): Promise<number>
  /** Records that the member opened Matches, now (R-MINE-4). */
  markSeen(memberId: string): Promise<void>
}

export interface CockpitService {
  cockpit(memberId: string): Promise<Cockpit>
  seen(memberId: string): Promise<void>
}

/** F8's cockpit: the member's challenges with their match counts, the trends
 * they follow, and what arrived since they last opened Matches, which badges
 * the nav until they open it again (R-MINE-1,3,4, R-CONN-7,9). */
export function createCockpit(deps: {
  store: CockpitStore
  followed: (memberId: string) => Promise<Trend[]>
}): CockpitService {
  return {
    seen: (memberId) => deps.store.markSeen(memberId),
    cockpit: async (memberId) => {
      const [challenges, following, pendingIncoming, newConnections] =
        await Promise.all([
          deps.store.challenges(memberId),
          deps.followed(memberId),
          deps.store.pendingIncoming(memberId),
          deps.store.newConnections(memberId),
        ])
      return { challenges, following, pendingIncoming, newConnections }
    },
  }
}
