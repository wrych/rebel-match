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
  pendingIncoming: number
  /** Accepted requests the member has not opened yet (R-CONN-7,9). */
  newConnections: number
}

export interface CockpitStore {
  challenges(memberId: string): Promise<CockpitChallenge[]>
  pendingIncoming(memberId: string): Promise<number>
  newConnections(memberId: string): Promise<number>
}

/** F8's cockpit: the member's challenges with their match counts, the trends
 * they follow, how many requests wait for them and how many accepted ones
 * they have not opened, which badge the nav (R-MINE-1,3,4, R-CONN-7,9). */
export function createCockpit(deps: {
  store: CockpitStore
  followed: (memberId: string) => Promise<Trend[]>
}): { cockpit(memberId: string): Promise<Cockpit> } {
  return {
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
