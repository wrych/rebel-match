import type { AcceptedRequest, NewRequest } from './connection-notice.js'
import type { ConnectionService } from './connections.js'

/** What a notification says happened, as the screen words it (R-NOTE-1). */
export type NotificationKind =
  | 'connection_request'
  | 'connection_accepted'
  | 'connection_added'
  | 'applicant'

/** A notification as its recipient sees it in the list (R-NOTE-5): the member
 * it is about by name only, and where tapping it leads. */
export interface NotificationView {
  id: string
  kind: NotificationKind
  at: string
  isNew: boolean
  name: string
  path: string
}

/** A stored notification, with what the list needs to word it. */
export interface NotificationRow {
  id: string
  type: 'connection_request' | 'new_connection' | 'applicant'
  createdAt: Date
  seenAt: Date | null
  /** The display name, or for an applicant what they gave or their address. */
  aboutName: string
  connectionId: string | null
  /** For a new connection: whether the recipient sent the request, so it was
   * accepted (R-CONN-7), or received it from a member already connected
   * (R-CONN-9). */
  recipientRequested: boolean
}

export interface NotificationStore {
  /** Stores one notification for the member a request concerns. */
  add(note: {
    recipientId: string
    type: 'connection_request' | 'new_connection'
    aboutMemberId: string
    connectionId: string
  }): Promise<void>
  /** Stores one notification for every member who may review applicants,
   * about the applicant with this address. */
  addApplicant(email: string): Promise<void>
  /** The member's notifications R-NOTE-5 shows, newest first; with
   * `before`, the page after that entry of theirs. */
  list(
    memberId: string,
    before: string | null,
    limit: number,
  ): Promise<NotificationRow[]>
  newCount(memberId: string): Promise<number>
  /** Marks those of `ids` that are the member's as seen. */
  markSeen(memberId: string, ids: readonly string[]): Promise<void>
  /** Marks the member's notifications about a request as seen; with
   * `between`, every one about a request between its two members. */
  markSeenForConnection(
    memberId: string,
    connectionId: string,
    between: boolean,
  ): Promise<void>
  markSeenForApplicants(memberId: string): Promise<void>
}

export interface NotificationService {
  /** A request was made to its target (R-CONN-2). */
  requested: (request: NewRequest) => Promise<void>
  /** A request was accepted, which its requester learns (R-CONN-7). */
  accepted: (request: AcceptedRequest) => Promise<void>
  /** A member already connected connected again, which the target learns
   * (R-CONN-9). */
  added: (request: NewRequest) => Promise<void>
  /** Someone asked to join (R-AUTH-2). */
  applicant: (email: string) => Promise<void>
  list(memberId: string, before: string | null): Promise<NotificationView[]>
  newCount(memberId: string): Promise<number>
  seen(memberId: string, ids: readonly string[]): Promise<void>
  /** The member opened a request; with `contact`, its contact screen, which
   * shows every request between the two (R-CONN-10). */
  openedConnection(
    memberId: string,
    connectionId: string,
    contact: boolean,
  ): Promise<void>
  openedApplicants(memberId: string): Promise<void>
}

const requestPath = (id: string): string =>
  `/matches/requests/${encodeURIComponent(id)}`

function kindOf(row: NotificationRow): NotificationKind {
  if (row.type !== 'new_connection') return row.type
  return row.recipientRequested ? 'connection_accepted' : 'connection_added'
}

// Where tapping an entry leads: the screen it comes from (R-NOTE-5).
function pathOf(row: NotificationRow): string {
  if (row.type === 'applicant' || row.connectionId === null)
    return '/admin/applicants'
  return row.type === 'connection_request'
    ? requestPath(row.connectionId)
    : `${requestPath(row.connectionId)}/contact`
}

function viewOf(row: NotificationRow): NotificationView {
  return {
    id: row.id,
    kind: kindOf(row),
    at: row.createdAt.toISOString(),
    isNew: row.seenAt === null,
    name: row.aboutName,
    path: pathOf(row),
  }
}

/** Notifications kept in the app (R-NOTE-4..6, ADR 0037). Mail still goes as
 * it did, beside them; the worker takes it over later. */
export function createNotifications(deps: {
  store: NotificationStore
  pageSize: () => number
}): NotificationService {
  const { store } = deps
  return {
    requested: (request) =>
      store.add({
        recipientId: request.targetId,
        type: 'connection_request',
        aboutMemberId: request.requesterId,
        connectionId: request.id,
      }),
    accepted: (request) =>
      store.add({
        recipientId: request.requesterId,
        type: 'new_connection',
        aboutMemberId: request.targetId,
        connectionId: request.id,
      }),
    added: (request) =>
      store.add({
        recipientId: request.targetId,
        type: 'new_connection',
        aboutMemberId: request.requesterId,
        connectionId: request.id,
      }),
    applicant: (email) => store.addApplicant(email),
    list: async (memberId, before) =>
      (await store.list(memberId, before, deps.pageSize())).map(viewOf),
    newCount: (memberId) => store.newCount(memberId),
    seen: (memberId, ids) =>
      ids.length === 0 ? Promise.resolve() : store.markSeen(memberId, ids),
    openedConnection: (memberId, connectionId, contact) =>
      store.markSeenForConnection(memberId, connectionId, contact),
    openedApplicants: (memberId) => store.markSeenForApplicants(memberId),
  }
}

/** Runs the notification before the mail, so a mail that fails, which
 * withdraws what it announces, takes the notification with it. */
export function thenMail<T>(
  note: (event: T) => Promise<void>,
  mail: (event: T) => Promise<void>,
): (event: T) => Promise<void> {
  return async (event) => {
    await note(event)
    await mail(event)
  }
}

/** The connections, marking the reader's notifications about a request seen
 * when they open it, or its contact screen, which shows every request between
 * the two (R-NOTE-5, R-CONN-10). */
export function markingOpened(
  connections: ConnectionService,
  notes: Pick<NotificationService, 'openedConnection'>,
): ConnectionService {
  return {
    ...connections,
    get: async (memberId, id) => {
      const view = await connections.get(memberId, id)
      if (view !== null) await notes.openedConnection(memberId, id, false)
      return view
    },
    contact: async (memberId, id) => {
      const contact = await connections.contact(memberId, id)
      if (contact !== null) await notes.openedConnection(memberId, id, true)
      return contact
    },
  }
}
