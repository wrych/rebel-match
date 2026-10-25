import type { NetworkTimeline } from '../../src/network/timeline'
import { findJson } from './request'

export type { NetworkTimeline }

/** The network replay, or null while hosts have it off (R-NET-6). */
export async function fetchNetwork(): Promise<NetworkTimeline | null> {
  return findJson<NetworkTimeline>('/api/network', 'network unavailable')
}

/** Whether the menu offers the replay: hosts have it on and the member may
 * see it (R-NET-5, R-NET-6, R-ROLE-4). */
export function networkOpen(
  networkReplay: number,
  permissions: readonly string[],
): boolean {
  return networkReplay === 1 && permissions.includes('network:view')
}
