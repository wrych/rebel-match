import type { ModerationReason } from './challenge-moderation.js'
import { trackNothing, type Track } from './analytics.js'
import type { PersonCard } from './person-card.js'
import { canReach } from './reach.js'
import type { SocialLinks } from '../social-links.js'

export type ConnectionKind = 'same_boat' | 'been_there' | 'direct'
export type ConnectionStatus = 'pending' | 'accepted' | 'declined'

/** Who a member is on a request card: never how to reach them (R-CONN-1). */
export type MemberCard = Omit<PersonCard, 'photo'>

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
  /** Left out once the viewer reported it (R-MOD-4), or for anyone but its
   * sender once a host hid it (R-MOD-8). */
  message: string | null
  noteReported: boolean
  /** Why a host hid the note; null while it is not hidden. */
  noteHiddenAs: ModerationReason | null
  createdAt: string
  other: MemberCard
  /** A challenge withdrawn (R-ASK-17) or hidden by a host (R-MOD-8) keeps its
   * place but loses its text. */
  challenge: {
    id: string
    body: string | null
    trendShort: string | null
    withdrawn: boolean
    hidden: boolean
  } | null
  /** True while the request is accepted and the viewer has not opened its
   * contact since, unless they accepted it themselves (R-CONN-7, R-CONN-9). */
  unseen: boolean
}

/** How the other party of an accepted request is reached (R-CONN-6,
 * R-PROF-5). */
export interface PartyContact {
  name: string
  email: string
  socialLinks: SocialLinks
}

export interface Contact extends PartyContact {
  mailto: string
  /** Every accepted request between the two, as the reader saw them before
   * this read (R-CONN-10). */
  over: ConnectionView[]
}

export interface NewConnection {
  targetId: string
  challengeId?: string | undefined
  kind: ConnectionKind
  message?: string | undefined
  /** For a direct request, the target's profile code (R-CODE-3). */
  profileCode?: string | undefined
}

export interface ConnectionStore {
  /** True for an active, onboarded member: someone a request can reach. */
  isReachable(memberId: string): Promise<boolean>
  /** True for a member who has not turned findable off (R-FIND-5). */
  isFindable(memberId: string): Promise<boolean>
  /** The author of an active challenge, or null. */
  challengeAuthor(challengeId: string): Promise<string | null>
  /** The pending request from requester to target about the same
   * challenge, or about none (R-CONN-5). */
  findPending(
    requesterId: string,
    targetId: string,
    challengeId: string | null,
  ): Promise<string | null>
  /** True when the two share an accepted request, either side (R-CONN-8). */
  isConnected(memberId: string, otherId: string): Promise<boolean>
  /** The newest accepted request between the two, either side, about the
   * same challenge or about none. */
  findAccepted(
    memberId: string,
    otherId: string,
    challengeId: string | null,
  ): Promise<string | null>
  /** Stores a pending request with its target's notification: `taken` when
   * one is already pending between the same two members about the same
   * challenge, `limit` when the requester already sent `cap` direct
   * requests in the last day, however close the race (R-CONN-5, R-FIND-7,
   * R-NOTE-10). */
  insert(
    record: Omit<ConnectionRecord, 'status' | 'createdAt'>,
    cap: number | null,
  ): Promise<Stored>
  /** Stores a request accepted at once, unseen by both, with its target's
   * notification, or `limit` as `insert` (R-CONN-8, R-CONN-9). */
  insertAccepted(
    record: Omit<ConnectionRecord, 'status' | 'createdAt'>,
    cap: number | null,
  ): Promise<Exclude<Stored, 'taken'>>
  /** Accepts every request still pending between the two, either side, as
   * seen by `accepterId`, who just accepted one of them (R-CONN-11). */
  acceptPending(accepterId: string, otherId: string): Promise<void>
  find(id: string): Promise<ConnectionRecord | null>
  /** The request as `viewerId` sees it, or null when they are no party. */
  view(id: string, viewerId: string): Promise<ConnectionView | null>
  incoming(targetId: string): Promise<ConnectionView[]>
  /** Accepted requests `memberId` is a party to, either side (R-MINE-5). */
  connected(memberId: string): Promise<ConnectionView[]>
  /** Accepted requests between the two, as `viewerId` sees them, newest
   * first (R-CONN-10). */
  connectedOver(viewerId: string, otherId: string): Promise<ConnectionView[]>
  /** Moves a pending request addressed to `targetId`, an acceptance with the
   * requester's notification; false otherwise (R-CONN-7). */
  respond(
    id: string,
    targetId: string,
    status: ConnectionStatus,
  ): Promise<boolean>
  /** The other party's name, email and social links, only for an accepted
   * request that `viewerId` is a party to; null in every other case
   * (R-CONN-3, R-CONN-6, R-PROF-5). */
  contactFor(id: string, viewerId: string): Promise<PartyContact | null>
  /** Records the viewer's first read of the accepted requests between the
   * two, which ends their notices (R-CONN-7, R-CONN-9). */
  markSeen(viewerId: string, otherId: string): Promise<void>
}

/** What storing a request came to. */
export type Stored = 'stored' | 'taken' | 'limit'

export type RequestOutcome =
  | { result: 'created'; id: string }
  | { result: 'exists'; id: string }
  | { result: 'joined'; id: string }
  | { result: 'limit' }
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

const otherOf = (record: ConnectionRecord, memberId: string): string =>
  record.requesterId === memberId ? record.targetId : record.requesterId

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

/** Whether direct requests may be sent now, how many a day, and whose
 * profile code a token is (R-FIND-7, R-CODE-3). */
export interface DirectRules {
  searchOn: boolean
  perDay: number
  codesOn: boolean
  /** The owner of the profile code `token`, while it is on; else null. */
  codeOwner: (token: string) => Promise<string | null>
}

const directClosed = (): DirectRules => ({
  searchOn: false,
  perDay: 0,
  codesOn: false,
  codeOwner: () => Promise.resolve(null),
})

async function presentsCode(
  rules: DirectRules,
  input: NewConnection,
): Promise<boolean> {
  if (input.profileCode === undefined || !rules.codesOn) return false
  return (await rules.codeOwner(input.profileCode)) === input.targetId
}

// A direct request is about no challenge, and reaches only a member search
// would find, or one whose usable profile code the requester holds
// (R-FIND-7, R-CODE-3, ADR 0062).
async function reachesDirectly(
  store: ConnectionStore,
  rules: DirectRules,
  requesterId: string,
  input: NewConnection,
): Promise<boolean> {
  if (input.challengeId !== undefined) return false
  return canReach({
    isCaller: input.targetId === requesterId,
    reachable: await store.isReachable(input.targetId),
    findable: await store.isFindable(input.targetId),
    searchOn: rules.searchOn,
    presentsCode: await presentsCode(rules, input),
    codesOn: rules.codesOn,
  })
}

async function mayRequest(
  store: ConnectionStore,
  rules: DirectRules,
  requesterId: string,
  input: NewConnection,
): Promise<boolean> {
  if (input.kind === 'direct')
    return reachesDirectly(store, rules, requesterId, input)
  if (input.targetId === requesterId) return false
  if (!(await store.isReachable(input.targetId))) return false
  return contextHolds(store, requesterId, input)
}

// The day's cap applies to direct requests only; null leaves a request
// uncapped (R-FIND-7).
const capOf = (rules: DirectRules, input: NewConnection): number | null =>
  input.kind === 'direct' ? rules.perDay : null

/** Stores a pending request unless one is already pending between the same
 * two members about the same challenge; the database's partial unique index
 * settles a race between two such inserts (R-CONN-5). */
async function storePending(
  deps: Asking,
  requesterId: string,
  input: NewConnection,
): Promise<RequestOutcome> {
  const { store, newId } = deps
  const challengeId = input.challengeId ?? null
  const pending = (): Promise<string | null> =>
    store.findPending(requesterId, input.targetId, challengeId)
  const existing = await pending()
  if (existing !== null) return { result: 'exists', id: existing }

  const id = newId()
  const stored = await store.insert(
    {
      id,
      requesterId,
      targetId: input.targetId,
      challengeId,
      kind: input.kind,
      message: input.message ?? null,
    },
    deps.cap,
  )
  if (stored === 'stored') return { result: 'created', id }
  if (stored === 'limit') return { result: 'limit' }
  const raced = await pending()
  return raced === null
    ? { result: 'not_found' }
    : { result: 'exists', id: raced }
}

interface Asking {
  store: ConnectionStore
  newId: () => string
  track: Track
  cap: number | null
}

// The double opt-in proper: pending, and the target told, by a notification
// stored with the request (R-CONN-1, R-CONN-2, R-NOTE-10).
async function ask(
  deps: Asking,
  requesterId: string,
  input: NewConnection,
): Promise<RequestOutcome> {
  const outcome = await storePending(deps, requesterId, input)
  if (outcome.result !== 'created') return outcome
  void deps.track(requesterId, {
    name: 'connection_requested',
    kind: input.kind,
  })
  return outcome
}

// Both opted in already, so nothing is left to answer; a challenge they are
// connected over already adds nothing (R-CONN-8, R-CONN-9).
async function join(
  deps: Asking,
  requesterId: string,
  input: NewConnection,
): Promise<RequestOutcome> {
  const challengeId = input.challengeId ?? null
  const existing = await deps.store.findAccepted(
    requesterId,
    input.targetId,
    challengeId,
  )
  if (existing !== null) return { result: 'joined', id: existing }

  const id = deps.newId()
  const stored = await deps.store.insertAccepted(
    {
      id,
      requesterId,
      targetId: input.targetId,
      challengeId,
      kind: input.kind,
      message: input.message ?? null,
    },
    deps.cap,
  )
  if (stored === 'limit') return { result: 'limit' }
  void deps.track(requesterId, {
    name: 'connection_requested',
    kind: input.kind,
  })
  return { result: 'joined', id }
}

// Once connected, nothing between the two is left to answer (R-CONN-11).
async function settleAccepted(
  store: ConnectionStore,
  id: string,
): Promise<void> {
  const record = await store.find(id)
  if (record === null) return
  await store.acceptPending(record.targetId, record.requesterId)
}

const MS_PER_HOUR = 3_600_000

// How long the request waited for its answer, in whole hours (R-ANA-1).
function hoursSince(createdAt: string, now: Date): number {
  return Math.max(
    0,
    Math.round((now.getTime() - new Date(createdAt).getTime()) / MS_PER_HOUR),
  )
}

async function respondTo(
  deps: Asking & { now: () => Date },
  memberId: string,
  id: string,
  answer: 'accepted' | 'declined',
): Promise<'done' | 'not_found'> {
  const record = await deps.store.find(id)
  if (record === null || !(await deps.store.respond(id, memberId, answer)))
    return 'not_found'
  void deps.track(memberId, {
    name: 'connection_responded',
    status: answer,
    hours_to_respond: hoursSince(record.createdAt, deps.now()),
  })
  if (answer === 'accepted') await settleAccepted(deps.store, id)
  return 'done'
}

const NO_LINKS: SocialLinks = { linkedin: null, instagram: null }

async function readContact(
  deps: { store: ConnectionStore; track: Track; linksOn: () => boolean },
  memberId: string,
  id: string,
): Promise<Contact | null> {
  const { store, track } = deps
  const record = await store.find(id)
  if (record?.status !== 'accepted' || !isParty(record, memberId)) return null
  const found = await store.contactFor(id, memberId)
  if (found === null) return null
  const other = deps.linksOn() ? found : { ...found, socialLinks: NO_LINKS }
  const otherId = otherOf(record, memberId)
  const over = await store.connectedOver(memberId, otherId)
  await store.markSeen(memberId, otherId)
  void track(memberId, {
    name: 'contact_opened',
    unseen: over.some((each) => each.unseen),
  })
  return { ...other, mailto: mailtoFor(other.email), over }
}

/** The double opt-in (ADR 0004, F7): a request starts pending, reveals
 * nothing and tells its target; only the target may answer, and an acceptance
 * tells the requester. Between members already connected it is accepted at
 * once (ADR 0035). A direct request reaches only a member search would
 * find, capped per day (ADR 0062). An email is read only for an accepted request by a party.
 * Hidden reads as not found (R-NAV-8). */
export function createConnections(deps: {
  store: ConnectionStore
  newId: () => string
  track?: Track
  now?: () => Date
  direct?: () => DirectRules
  /** Whether hosts have social links on; off unless given (R-PROF-5). */
  socialLinksOn?: () => boolean
}): ConnectionService {
  const { store } = deps
  const direct = deps.direct ?? directClosed
  const track = deps.track ?? trackNothing
  const asking: Asking = { store, newId: deps.newId, track, cap: null }
  const now = deps.now ?? ((): Date => new Date())
  const linksOn = deps.socialLinksOn ?? ((): boolean => false)
  return {
    request: async (requesterId, input) => {
      const rules = direct()
      if (!(await mayRequest(store, rules, requesterId, input)))
        return { result: 'not_found' }
      const capped = { ...asking, cap: capOf(rules, input) }
      return (await store.isConnected(requesterId, input.targetId))
        ? join(capped, requesterId, input)
        : ask(capped, requesterId, input)
    },
    incoming: (memberId) => store.incoming(memberId),
    connected: (memberId) => store.connected(memberId),
    get: (memberId, id) => store.view(id, memberId),
    respond: (memberId, id, answer) =>
      respondTo({ ...asking, now }, memberId, id, answer),
    contact: (memberId, id) =>
      readContact({ store, track, linksOn }, memberId, id),
  }
}
