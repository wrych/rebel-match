import {
  castOnStage,
  type CastEntry,
  type CastMember,
} from '../presentation/cast.js'
import {
  buildTimeline,
  positionsOf,
  type NetworkTimeline,
} from '../network/timeline.js'
import type { NetworkStore } from './network.js'

/** What the stage plays: the whole network, nobody marked, and the cast
 * with their positions (R-PRES-4, R-PRES-6). */
export interface Presentation {
  timeline: NetworkTimeline
  cast: CastMember[]
}

export interface PresentationService {
  show(): Promise<Presentation>
}

/** The presentation's data: the replay's timeline with no viewer, and the
 * cast matched to it by email, which stays on the server (R-PRES-6). */
export function createPresentation(deps: {
  store: NetworkStore
  cast: readonly CastEntry[]
}): PresentationService {
  return {
    async show() {
      const facts = await deps.store.facts()
      const emails = deps.cast.flatMap((entry) =>
        entry.email === undefined ? [] : [entry.email],
      )
      const ids = await deps.store.idsByEmail(emails)
      const positions = positionsOf(facts)
      const nodeOf = (email: string): number | null =>
        positions.get(ids.get(email) ?? '') ?? null
      return {
        timeline: buildTimeline(facts, null),
        cast: castOnStage(deps.cast, nodeOf),
      }
    },
  }
}
