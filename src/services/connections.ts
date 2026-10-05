import { trackNothing, type Track } from './analytics.js'
import type { AcceptedRequest, NewRequest } from './connection-notice.js'

export type ConnectionKind = 'same_boat' | 'been_there'
export type ConnectionStatus = 'pending' | 'accepted' | 'declined'

/** Who a member is on a request card: never how to reach them (R-CONN-1). */
export interface MemberCard {
  memberId: string
  name: string
  jobTitle: string | null
  org: string | null
  /** Labels, as a card shows them, not the stored keys. */
  sector: string | null
  companySize: string | null
}

export interface ConnectionRecord {
  id: string
  requesterId: string
  targetId: string
  challengeId: string | null
  kind: ConnectionKind
  message: string | null
  status: ConnectionStatus
  createdAt: string
}

/** A request as either party sees it: the other member, the challenge in
 * context, the note. No email, whatever the status (R-CONN-1, R-CONN-2). */
export interface ConnectionView {
  id: string
  direction: 'incoming' | 'outgoing'
  kind: ConnectionKind
  status: ConnectionStatus
  message: string | null
  createdAt: string
  other: MemberCard
  challenge: { id: string; body: string; trendShort: string | null } | null
  /** True while the viewer sent this request, it was accepted, and they have
   * not opened its contact yet (R-CONN-7). */
  unseen: boolean
}

export interface Contact {
  name: string
  email: string
  mailto: string
}

export interface NewConnection {
  targetId: string
  challengeId?: string | undefined
  kind: ConnectionKind
  message?: string | undefined
}

export interface ConnectionStore {
  /** True for an active, onboarded member: someone a request can reach. */
  isReachable(memberId: string): Promise<boolean>
  /** The author of an active challenge, or null. */
  challengeAuthor(challengeId: string): Promise<string | null>
  /** The pending request from requester to target about the same
   * challenge, or about none (R-CONN-5). */
  findPending(
    requesterId: string,
    targetId: string,
    challengeId: string | null,
  ): Promise<string | null>
  /** Stores a pending request; false when one is already pending between
   * the same two members about the same challenge, however close the race. */
  insert(
    record: Omit<ConnectionRecord, 'status' | 'createdAt'>,
  ): Promise<boolean>
  /** Deletes a request its target was never told of. */
  remove(id: string): Promise<void>
  find(id: string): Promise<ConnectionRecord | null>
  /** The request as `viewerId` sees it, or null when they are no party. */
  view(id: string, viewerId: string): Promise<ConnectionView | null>
  incoming(targetId: string): Promise<ConnectionView[]>
  /** Accepted requests `memberId` is a party to, either side (R-MINE-5). */
  connected(memberId: string): Promise<ConnectionView[]>
  /** Moves a pending request addressed to `targetId`; false otherwise. */
  respond(
    id: string,
    targetId: string,
    status: ConnectionStatus,
  ): Promise<boolean>
  /** The other party's name and email, only for an accepted request that
   * `viewerId` is a party to; null in every other case (R-CONN-3, R-CONN-6). */
  contactFor(
    id: string,
    viewerId: string,
  ): Promise<{ name: string; email: string } | null>
  /** Records the requester's first read of an accepted request's contact,
   * which ends its notice (R-CONN-7). */
  markSeen(id: string, requesterId: string): Promise<void>
}

export type RequestOutcome =
  | { result: 'created'; id: string }
  | { result: 'exists'; id: string }
  | { result: 'not_found' }

export interface ConnectionService {
  request(requesterId: string, input: NewConnection): Promise<RequestOutcome>
  incoming(memberId: string): Promise<ConnectionView[]>
  connected(memberId: string): Promise<ConnectionView[]>
  get(memberId: string, id: string): Promise<ConnectionView | null>
  respond(
    memberId: string,
    id: string,
    answer: 'accepted' | 'declined',
  ): Promise<'done' | 'not_found'>
  contact(memberId: string, id: string): Promise<Contact | null>
}

const MAIL_SUBJECT = 'Connecting through Rebel Match'

// Addresses were validated when stored, so they go in as they are:
// percent-encoding the @ trips some mail apps.
function mailtoFor(email: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(MAIL_SUBJECT)}`
}

function isParty(record: ConnectionRecord, memberId: string): boolean {
  return record.requesterId === memberId || record.targetId === memberId
}

// A challenge gives a request context only when it belongs to one of the two
// members: the target's from the deck, or the requester's own from matches.
async function contextHolds(
  store: ConnectionStore,
  requesterId: string,
  input: NewConnection,
): Promise<boolean> {
  if (input.challengeId === undefined) return true
  const author = await store.challengeAuthor(input.challengeId)
  return author === requesterId || author === input.targetId
}

/** Stores a pending request unless one is already pending between the same
 * two members about the same challenge; the database's partial unique index
 * settles a race between two such inserts (R-CONN-5). */
async function storePending(
  store: ConnectionStore,
  newId: () => string,
  requesterId: string,
  input: NewConnection,
): Promise<RequestOutcome> {
  const challengeId = input.challengeId ?? null
  const pending = (): Promise<string | null> =>
    store.findPending(requesterId, input.targetId, challengeId)
  const existing = await pending()
  if (existing !== null) return { result: 'exists', id: existing }

  const id = newId()
  const stored = await store.insert({
    id,
    requesterId,
    targetId: input.targetId,
    challengeId,
    kind: input.kind,
    message: input.message ?? null,
  })
  if (stored) return { result: 'created', id }
  const raced = await pending()
  return raced === null
    ? { result: 'not_found' }
    : { result: 'exists', id: raced }
}

// A request its target was never told of is withdrawn, so a retry tells them.
async function notifyOrWithdraw(
  store: ConnectionStore,
  notify: (request: NewRequest) => Promise<void>,
  request: NewRequest,
): Promise<void> {
  try {
    await notify(request)
  } catch (error) {
    await store.remove(request.id)
    throw error
  }
}

const notifyNobody = (): Promise<void> => Promise.resolve()

// The requester learns of an acceptance by email as well as by the badge.
async function announceAccepted(
  store: ConnectionStore,
  notifyAccepted: (request: AcceptedRequest) => Promise<void>,
  id: string,
): Promise<void> {
  const record = await store.find(id)
  if (record === null) return
  await notifyAccepted({
    id,
    requesterId: record.requesterId,
    targetId: record.targetId,
  })
}

async function readContact(
  store: ConnectionStore,
  memberId: string,
  id: string,
): Promise<Contact | null> {
  const record = await store.find(id)
  if (record?.status !== 'accepted' || !isParty(record, memberId)) return null
  const other = await store.contactFor(id, memberId)
  if (other === null) return null
  if (record.requesterId === memberId) await store.markSeen(id, memberId)
  return { ...other, mailto: mailtoFor(other.email) }
}

/** The double opt-in (ADR 0004, F7): a request starts pending, reveals
 * nothing and tells its target; only the target may answer, and an acceptance
 * tells the requester; an email is read only for an accepted request by a
 * party. Hidden reads as not found (R-NAV-8). */
export function createConnections(deps: {
  store: ConnectionStore
  newId: () => string
  track?: Track
  notify?: (request: NewRequest) => Promise<void>
  notifyAccepted?: (request: AcceptedRequest) => Promise<void>
}): ConnectionService {
  const { store } = deps
  const track = deps.track ?? trackNothing
  const notify = deps.notify ?? notifyNobody
  const notifyAccepted = deps.notifyAccepted ?? notifyNobody
  return {
    request: async (requesterId, input) => {
      if (input.targetId === requesterId) return { result: 'not_found' }
      if (!(await store.isReachable(input.targetId)))
        return { result: 'not_found' }
      if (!(await contextHolds(store, requesterId, input))) {
        return { result: 'not_found' }
      }
      const outcome = await storePending(store, deps.newId, requesterId, input)
      if (outcome.result !== 'created') return outcome
      await notifyOrWithdraw(store, notify, {
        id: outcome.id,
        requesterId,
        targetId: input.targetId,
        message: input.message ?? null,
      })
      void track(requesterId, {
        name: 'connection_requested',
        kind: input.kind,
      })
      return outcome
    },
    incoming: (memberId) => store.incoming(memberId),
    connected: (memberId) => store.connected(memberId),
    get: (memberId, id) => store.view(id, memberId),
    respond: async (memberId, id, answer) => {
      if (!(await store.respond(id, memberId, answer))) return 'not_found'
      void track(memberId, { name: 'connection_responded', status: answer })
      if (answer === 'accepted')
        await announceAccepted(store, notifyAccepted, id)
      return 'done'
    },
    contact: (memberId, id) => readContact(store, memberId, id),
  }
}
