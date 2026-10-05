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
