import type { Cockpit } from '../../src/services/cockpit'
import type { ConnectionView } from '../../src/services/connections'

export type { Cockpit }

/** The member's challenges with their counts, the trends they follow, and
 * how many requests wait for them (R-MINE-1,3,4). */
export async function fetchCockpit(): Promise<Cockpit> {
  const response = await fetch('/api/cockpit')
  if (!response.ok)
    throw new Error(`cockpit unavailable (${String(response.status)})`)
  return (await response.json()) as Cockpit
}

/** What badges the way to Matches: requests waiting for the member, and their
 * own requests accepted but not opened yet (R-MINE-4, R-CONN-7). */
export interface MatchesNews {
  waiting: number
  connected: number
}

export const NO_NEWS: MatchesNews = { waiting: 0, connected: 0 }

const countOf = (value: unknown): number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0

/** The cockpit's two badge counts, anything but a positive whole number read
 * as none. */
export async function fetchMatchesNews(): Promise<MatchesNews> {
  const cockpit = await fetchCockpit()
  return {
    waiting: countOf(cockpit.pendingIncoming),
    connected: countOf(cockpit.newConnections),
  }
}

/** Accepted requests the member is a party to, either side (R-MINE-5). */
export async function fetchConnected(): Promise<ConnectionView[]> {
  const response = await fetch('/api/connections/connected')
  if (!response.ok)
    throw new Error(`connections unavailable (${String(response.status)})`)
  return ((await response.json()) as { connections: ConnectionView[] })
    .connections
}

/** Requests waiting for the member's answer (R-MINE-2). */
export async function fetchIncoming(): Promise<ConnectionView[]> {
  const response = await fetch('/api/connections/incoming')
  if (!response.ok)
    throw new Error(`requests unavailable (${String(response.status)})`)
  return ((await response.json()) as { requests: ConnectionView[] }).requests
}
