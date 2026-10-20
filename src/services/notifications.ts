import { eventRow, rowNames, type RowNames } from '../badges/rows.js'
import type { BadgeService } from './badges.js'
import type { ConnectionService } from './connections.js'
import type { DeckService } from './deck.js'

/** What a notification says happened, as the screen words it (R-NOTE-1). */
export const notificationKinds = [
  'connection_request',
  'connection_accepted',
  'connection_added',
  'trend_challenge',
  'applicant',
  'badge',
] as const

export type NotificationKind = (typeof notificationKinds)[number]

/** A notification as its recipient sees it in the list (R-NOTE-5): the member
 * it is about by name only, and where tapping it leads. */
export interface NotificationView {
  id: string
  kind: NotificationKind
  at: string
  isNew: boolean
  name: string
  path: string
  /** The trend a new challenge was posted in; null for every other kind. */
  trend: string | null
}

/** A stored notification, with what the list needs to word it. */
export interface NotificationRow {
  id: string
  type: StoredType
  createdAt: Date
  seenAt: Date | null
  /** The display name, or for an applicant what they gave or their address. */
  aboutName: string
  connectionId: string | null
  /** For a new connection: whether the recipient sent the request, so it was
   * accepted (R-CONN-7), or received it from a member already connected
   * (R-CONN-9). */
  recipientRequested: boolean
  challengeId: string | null
  /** The short name of a new challenge's trend. */
  trend: string | null
  badge: GainedBadge | null
}

/** A badge gained: its row and level, 0 for the crown; or under the row
 * `event`, an event badge by its name (R-BADGE-6). */
export interface GainedBadge {
  row: string
  level: number
  eventName: string | null
}

/** A notification's type as stored (R-NOTE-1). */
export type StoredType =
  | 'connection_request'
  | 'new_connection'
  | 'trend_challenge'
  | 'applicant'
  | 'badge'

export interface NotificationStore {
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
  markSeenForChallenge(memberId: string, challengeId: string): Promise<void>
  /** Marks the member's notifications of badges in these rows as seen. */
  markSeenForBadges(memberId: string, rows: readonly string[]): Promise<void>
}

export interface NotificationService {
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
  /** The member's deck opened at this challenge's card (R-OFF-7). */
  openedChallenge(memberId: string, challengeId: string): Promise<void>
  /** The member opened these rows of their badges (R-BADGE-10). */
  openedBadges(memberId: string, rows: readonly string[]): Promise<void>
}

/** A gained badge's name: the row's crown at level 0, else the level's; an
 * event badge's own. */
export function badgeName(badge: GainedBadge | null): string {
  if (badge?.row === eventRow) return badge.eventName ?? ''
  const names =
    badge === null
      ? undefined
      : (rowNames as Readonly<Record<string, RowNames | undefined>>)[badge.row]
  if (names === undefined || badge === null) return ''
  return badge.level === 0 ? names.crown : (names.levels[badge.level - 1] ?? '')
}

/** Where a gained badge is seen: its row's screen, or the event badges'. */
export const badgePath = (row: string): string =>
  row === eventRow ? '/badges/events' : `/badges/${encodeURIComponent(row)}`

const requestPath = (id: string): string =>
  `/matches/requests/${encodeURIComponent(id)}`

function kindOf(row: NotificationRow): NotificationKind {
  if (row.type !== 'new_connection') return row.type
  return row.recipientRequested ? 'connection_accepted' : 'connection_added'
}

// Where tapping an entry leads: the screen it comes from (R-NOTE-5, R-OFF-7).
function pathOf(row: NotificationRow): string {
  if (row.type === 'badge') return badgePath(row.badge?.row ?? '')
  if (row.type === 'trend_challenge')
    return `/offer?challenge=${encodeURIComponent(row.challengeId ?? '')}`
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
    name: row.type === 'badge' ? badgeName(row.badge) : row.aboutName,
    path: pathOf(row),
    trend: row.type === 'trend_challenge' ? row.trend : null,
  }
}

/** Notifications kept in the app (R-NOTE-4..6, ADR 0037). They are written
 * with their events by the stores that record them, and mailed by the
 * worker. */
export function createNotifications(deps: {
  store: NotificationStore
  pageSize: () => number
}): NotificationService {
  const { store } = deps
  return {
    list: async (memberId, before) =>
      (await store.list(memberId, before, deps.pageSize())).map(viewOf),
    newCount: (memberId) => store.newCount(memberId),
    seen: (memberId, ids) =>
      ids.length === 0 ? Promise.resolve() : store.markSeen(memberId, ids),
    openedConnection: (memberId, connectionId, contact) =>
      store.markSeenForConnection(memberId, connectionId, contact),
    openedApplicants: (memberId) => store.markSeenForApplicants(memberId),
    openedChallenge: (memberId, challengeId) =>
      store.markSeenForChallenge(memberId, challengeId),
    openedBadges: (memberId, rows) =>
      rows.length === 0
        ? Promise.resolve()
        : store.markSeenForBadges(memberId, rows),
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

/** The deck, marking the viewer's notification of a new challenge seen when
 * the deck opens at its card, the screen it leads to (R-NOTE-5, R-OFF-7). */
export function markingDeckOpened(
  deck: DeckService,
  notes: Pick<NotificationService, 'openedChallenge'>,
): DeckService {
  return {
    next: async (viewerId, first) => {
      const cards = await deck.next(viewerId, first)
      if (first !== undefined && cards[0]?.challengeId === first)
        await notes.openedChallenge(viewerId, first)
      return cards
    },
  }
}

/** The badges, marking the member's notifications of badges in the rows they
 * opened seen, as those rows are the screens the notifications lead to
 * (R-NOTE-5, R-BADGE-10). */
export function markingBadgesOpened(
  badges: BadgeService,
  notes: Pick<NotificationService, 'openedBadges'>,
): BadgeService {
  return {
    ...badges,
    seen: async (memberId, rows) => {
      await badges.seen(memberId, rows)
      await notes.openedBadges(memberId, rows)
    },
  }
}
