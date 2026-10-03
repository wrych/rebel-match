import type { NewConnection } from '../../src/services/connections'

export type ConnectionKind = NewConnection['kind']

export type RequestOutcome = 'created' | 'exists' | 'not_found'

/** Asks a peer to connect. Nothing is shared until they accept (R-CONN-1);
 * a pending request already sent reads as 'exists' (R-CONN-5). */
export async function requestConnection(
  input: NewConnection,
): Promise<RequestOutcome> {
  const response = await fetch('/api/connections', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (response.status === 201) return 'created'
  if (response.status === 409) return 'exists'
  if (response.status === 404) return 'not_found'
  throw new Error(`request not sent (${String(response.status)})`)
}

/** The kind named in a link, or null for anything else. */
export function kindOf(value: unknown): ConnectionKind | null {
  return value === 'same_boat' || value === 'been_there' ? value : null
}
