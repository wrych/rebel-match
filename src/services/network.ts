import {
  buildTimeline,
  type NetworkFacts,
  type NetworkTimeline,
} from '../network/timeline.js'

export interface NetworkStore {
  /** Active, onboarded members and the accepted connections between them
   * (R-NET-4). */
  facts(): Promise<NetworkFacts>
}

export interface NetworkService {
  /** The network as it grew, with the viewer marked (R-NET-1, R-NET-2). */
  timeline(viewerId: string): Promise<NetworkTimeline>
}

/** The network replay's data: whoever asks sees the same network, only
 * their own point told apart, and their own lines only once they have
 * enough (R-NET-3, R-NET-13). The threshold is read on every ask, so a
 * host's change applies at once. */
export function createNetwork(deps: {
  store: NetworkStore
  neededOwnLinks: () => number
}): NetworkService {
  return {
    timeline: async (viewerId) =>
      buildTimeline(await deps.store.facts(), viewerId, deps.neededOwnLinks()),
  }
}
