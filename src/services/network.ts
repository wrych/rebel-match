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

/** The network replay's data: whoever asks sees the same network, and only
 * their own point is told apart (R-NET-3). */
export function createNetwork(deps: { store: NetworkStore }): NetworkService {
  return {
    timeline: async (viewerId) =>
      buildTimeline(await deps.store.facts(), viewerId),
  }
}
