import type {
  Contact,
  ConnectionView,
  NewConnection,
} from '../../src/services/connections'

export type { Contact, ConnectionView }

export type ConnectionKind = NewConnection['kind']

export type RequestOutcome =
  | { result: 'created' | 'exists' | 'not_found' }
  | { result: 'joined'; id: string }

/** Asks a peer to connect. Nothing is shared until they accept (R-CONN-1);
 * a pending request already sent reads as 'exists' (R-CONN-5), and one to a
 * member already connected as 'joined', with its id (R-CONN-8). */
export async function requestConnection(
  input: NewConnection,
): Promise<RequestOutcome> {
  const response = await fetch('/api/connections', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (response.status === 201) return { result: 'created' }
  if (response.status === 409) return { result: 'exists' }
  if (response.status === 404) return { result: 'not_found' }
  if (response.status === 200) {
    const { id } = (await response.json()) as { id: string }
    return { result: 'joined', id }
  }
  throw new Error(`request not sent (${String(response.status)})`)
}

/** Where a connection's contact, and what the two are connected over, is
 * shown (S16). */
export const contactPath = (id: string): string =>
  `/matches/requests/${encodeURIComponent(id)}/contact`

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

/** One connected member as the cockpit lists them: the request their card
 * opens, and how many requests with them the member has not opened yet. */
export interface ConnectedMember {
  id: string
  other: ConnectionView['other']
  unseen: number
}

/** Connections newest first, as listed, become one card per member; those
 * with something unopened come first, the order otherwise kept (R-MINE-5,6). */
export function byMember(connections: ConnectionView[]): ConnectedMember[] {
  const cards = new Map<string, ConnectedMember>()
  for (const connection of connections) {
    const memberId = connection.other.memberId
    const card = cards.get(memberId) ?? {
      id: connection.id,
      other: connection.other,
      unseen: 0,
    }
    if (connection.unseen) {
      if (card.unseen === 0) card.id = connection.id
      card.unseen += 1
    }
    cards.set(memberId, card)
  }
  return newFirst([...cards.values()], (card) => card.unseen > 0)
}

/** What two members are connected over, those not opened yet first, the
 * order otherwise kept (R-CONN-10). */
export function overInOrder(over: ConnectionView[]): ConnectionView[] {
  return newFirst(over, (each) => each.unseen)
}

function newFirst<T>(items: T[], isNew: (item: T) => boolean): T[] {
  return [...items.filter(isNew), ...items.filter((item) => !isNew(item))]
}
