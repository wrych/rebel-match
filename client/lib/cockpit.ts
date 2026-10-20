import type { Cockpit } from '../../src/services/cockpit'
import type { ConnectionView } from '../../src/services/connections'
import { ensureOk, getJson, send } from './request'

export type { Cockpit }

/** The member's challenges with their counts, the trends they follow, and
 * how many requests wait for them (R-MINE-1,3,4). */
export async function fetchCockpit(): Promise<Cockpit> {
  return getJson<Cockpit>('/api/cockpit', 'cockpit unavailable')
}

/** What badges the way to Matches: requests waiting for the member and
 * connections not opened yet, that arrived since they last opened Matches
 * (R-MINE-4, R-CONN-7). */
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

/** Records that the member opened Matches, so what arrived before no longer
 * badges it (R-MINE-4). */
export async function markMatchesSeen(): Promise<void> {
  ensureOk(await send('/api/matches/seen', 'POST'), 'matches not marked')
}

/** Accepted requests the member is a party to, either side (R-MINE-5). */
export async function fetchConnected(): Promise<ConnectionView[]> {
  const { connections } = await getJson<{ connections: ConnectionView[] }>(
    '/api/connections/connected',
    'connections unavailable',
  )
  return connections
}

/** Requests waiting for the member's answer (R-MINE-2). */
export async function fetchIncoming(): Promise<ConnectionView[]> {
  const { requests } = await getJson<{ requests: ConnectionView[] }>(
    '/api/connections/incoming',
    'requests unavailable',
  )
  return requests
}
