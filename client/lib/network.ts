import type { NetworkTimeline, OwnLinks } from '../../src/network/timeline'
import { findJson } from './request'

export type { NetworkTimeline, OwnLinks }

/** What the callout at the viewer's point says about them (R-NET-14). */
export interface SelfStats {
  connections: number
  hidden: boolean
  challenges: number
  joined: string
}

/** The viewer's own figures, or null when the replay marks nobody. Their
 * connections count those left out too, flagged as hidden (R-NET-13). */
export function selfStats(timeline: NetworkTimeline): SelfStats | null {
  const self = timeline.nodes.find((node) => node.self)
  if (self === undefined) return null
  const drawn = timeline.links.filter(
    (link) => link.source === self.id || link.target === self.id,
  ).length
  return {
    connections: timeline.own?.count ?? drawn,
    hidden: timeline.own?.shown === false,
    challenges: timeline.moons.filter((moon) => moon.node === self.id).length,
    joined: self.day,
  }
}

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

const connections = (n: number): string =>
  `${String(n)} ${n === 1 ? 'connection' : 'connections'}`

/** Why the member's own lines are missing, as the footnote to the starred
 * count in their callout, or null when they show (R-NET-13). */
export function ownLinksHint(own: OwnLinks | null): string | null {
  if (own === null || own.shown) return null
  const have =
    own.count === 0
      ? 'You have no connections yet'
      : `You have ${connections(own.count)}`
  return (
    `* Your own connections show once you have ${connections(own.needed)}. ` +
    `${have}, and with so few you could tell who the dots at their ends ` +
    'are, which would say things about them they never shared.'
  )
}
