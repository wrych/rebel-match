import type {
  Contact,
  ConnectionView,
  NewConnection,
} from '../../src/services/connections'

export type { Contact, ConnectionView }

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

const requestPath = (id: string): string =>
  `/api/connections/${encodeURIComponent(id)}`

/** A request the member is a party to, or null for any other (R-NAV-8). */
export async function fetchRequest(id: string): Promise<ConnectionView | null> {
  const response = await fetch(requestPath(id))
  if (response.status === 404) return null
  if (!response.ok)
    throw new Error(`request unavailable (${String(response.status)})`)
  return ((await response.json()) as { request: ConnectionView }).request
}

/** Accepts or declines a pending request addressed to the member; 'gone'
 * when there is no such request waiting for them (R-CONN-3,4). */
export async function answerRequest(
  id: string,
  verdict: 'accept' | 'decline',
): Promise<'done' | 'gone'> {
  const response = await fetch(`${requestPath(id)}/${verdict}`, {
    method: 'POST',
  })
  if (response.status === 404) return 'gone'
  if (!response.ok)
    throw new Error(`answer not saved (${String(response.status)})`)
  return 'done'
}

/** The other party's contact, which the server gives only for an accepted
 * request to one of its parties; null otherwise (R-CONN-3,6). */
export async function fetchContact(id: string): Promise<Contact | null> {
  const response = await fetch(`${requestPath(id)}/contact`)
  if (response.status === 404) return null
  if (!response.ok)
    throw new Error(`contact unavailable (${String(response.status)})`)
  return ((await response.json()) as { contact: Contact }).contact
}
