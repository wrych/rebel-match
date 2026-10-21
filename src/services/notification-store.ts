import { randomUUID } from 'node:crypto'
import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import {
  challenges,
  connectionRequests,
  eventBadges,
  follows,
  memberRoles,
  members,
  notificationSettings,
  notifications,
  reports,
  trends,
} from '../db/schema.js'
import { isShown } from './challenge-store.js'
import type { NotificationRow, NotificationStore } from './notifications.js'

const n = notifications
const about = members
const request = connectionRequests

function reviews(roles: readonly string[], memberId: unknown): SQL {
  return sql`exists (select 1 from ${memberRoles} where ${memberRoles.memberId} = ${memberId} and ${inArray(memberRoles.roleKey, [...roles])})`
}

// What R-NOTE-5 shows: not hidden, about nobody deleted, an applicant notice
// only to someone who may still review applicants, and a new challenge only
// while it is still shown.
/** The roles that may review applicants and reports, read from the policy
 * (R-ROLE-3): notices of either reach only their holders. */
export interface Reviewers {
  applicants: readonly string[]
  reports: readonly string[]
}

function shown(reviewers: Reviewers, memberId: string): SQL | undefined {
  return and(
    eq(n.recipientId, memberId),
    eq(n.hidden, false),
    ne(about.status, 'deleted'),
    or(ne(n.type, 'applicant'), reviews(reviewers.applicants, memberId)),
    or(ne(n.type, 'report'), reviews(reviewers.reports, memberId)),
    or(
      ne(n.type, 'trend_challenge'),
      sql`exists (select 1 from ${challenges} where ${challenges.id} = ${n.challengeId} and ${isShown()})`,
    ),
  )
}

/** Stores a notification inside the transaction that records its event, so
 * the event stands with it whatever happens to the mail (R-NOTE-10). The
 * worker mails it. */
export async function insertNotification(
  db: Database,
  note: {
    recipientId: string
    type: 'connection_request' | 'new_connection'
    aboutMemberId: string
    connectionId: string
  },
): Promise<void> {
  await db.insert(n).values({
    id: randomUUID(),
    ...note,
    hidden: offFor(note.recipientId, note.type),
  })
}

/** Stores a member's notification of a badge they gained, about nobody but
 * themselves; level 0 is the row's crown (R-BADGE-10, R-NOTE-1). */
export async function insertBadgeNotification(
  db: Database,
  note: {
    recipientId: string
    row: string
    level: number
    eventBadgeId?: string
  },
): Promise<void> {
  await db.insert(n).values({
    id: randomUUID(),
    recipientId: note.recipientId,
    type: 'badge',
    aboutMemberId: note.recipientId,
    badgeRow: note.row,
    badgeLevel: note.level,
    eventBadgeId: note.eventBadgeId ?? null,
    hidden: offFor(note.recipientId, 'badge'),
  })
}

// Stored but hidden when the recipient set the type to Off (R-NOTE-4).
function offFor(recipient: unknown, type: string): SQL<boolean> {
  return sql<boolean>`exists (select 1 from ${notificationSettings} where ${notificationSettings.memberId} = ${recipient} and ${notificationSettings.type} = ${type} and ${notificationSettings.cadence} = 'off')`
}

/** Stores, inside the transaction that first puts a challenge in a trend, a
 * notification for every active member following it but its author
 * (R-ASK-9, R-NOTE-1, R-NOTE-10). */
export async function insertTrendNotifications(
  db: Database,
  challenge: { id: string; authorId: string; trendId: string },
): Promise<void> {
  await db.execute(sql`
    insert into ${n} (id, recipient_id, type, about_member_id, challenge_id, hidden)
    select gen_random_uuid()::text, follower.id, 'trend_challenge', ${challenge.authorId}, ${challenge.id},
      ${offFor(sql`follower.id`, 'trend_challenge')}
    from ${follows} f join ${members} follower on follower.id = f.member_id
    where f.trend_id = ${challenge.trendId}
      and follower.id <> ${challenge.authorId}
      and follower.status = 'active'
      and follower.name is not null`)
}

/** Stores, inside the transaction that records the applicant, a notification
 * for every active member who may review applicants (R-AUTH-2, R-NOTE-10). */
export async function insertApplicantNotifications(
  db: Database,
  roles: readonly string[],
  applicantId: string,
): Promise<void> {
  if (roles.length === 0) return
  await db.execute(sql`
    insert into ${n} (id, recipient_id, type, about_member_id, hidden)
    select gen_random_uuid()::text, reviewer.id, 'applicant', ${applicantId},
      ${offFor(sql`reviewer.id`, 'applicant')}
    from ${members} reviewer
    where reviewer.status = 'active'
      and ${reviews(roles, sql`reviewer.id`)}`)
}

/** Stores, inside the transaction that records a report, a notification
 * for every active member who may review reports, but never the reporter
 * nor the member reported (R-MOD-5, R-NOTE-10). */
export async function insertReportNotifications(
  db: Database,
  roles: readonly string[],
  report: { reportedId: string; reporterId: string },
): Promise<void> {
  if (roles.length === 0) return
  await db.execute(sql`
    insert into ${n} (id, recipient_id, type, about_member_id, hidden)
    select gen_random_uuid()::text, reviewer.id, 'report', ${report.reportedId},
      ${offFor(sql`reviewer.id`, 'report')}
    from ${members} reviewer
    where reviewer.status = 'active'
      and reviewer.id not in (${report.reportedId}, ${report.reporterId})
      and ${reviews(roles, sql`reviewer.id`)}`)
}

// After the member's own entry `id` in the list's order, compared in the
// database at full precision, so no row falls between two pages.
function olderThan(memberId: string, id: string): SQL {
  return sql`(${n.createdAt}, ${n.id}) < (select cursor.created_at, cursor.id from ${n} cursor where cursor.id = ${id} and cursor.recipient_id = ${memberId})`
}

interface ListedRow {
  id: string
  type: NotificationRow['type']
  createdAt: Date
  seenAt: Date | null
  aboutMemberId: string | null
  openReports: number
  name: string | null
  requestedName: string | null
  email: string
  connectionId: string | null
  requesterId: string | null
  challengeId: string | null
  trend: string | null
  badgeRow: string | null
  badgeLevel: number | null
  eventName: string | null
}

// An applicant is named by what they gave, else their address; a reported
// member by their name, else their address, as hosts know them; anyone else
// by their name (R-NOTE-5, R-MOD-5).
function nameOf(row: ListedRow): string {
  if (row.type === 'applicant')
    return row.requestedName ?? row.name ?? row.email
  if (row.type === 'report') return row.name ?? row.email
  return row.name ?? ''
}

function rowOf(row: ListedRow, memberId: string): NotificationRow {
  return {
    id: row.id,
    type: row.type,
    createdAt: row.createdAt,
    seenAt: row.seenAt,
    aboutName: nameOf(row),
    aboutMemberId: row.aboutMemberId ?? '',
    openReports: row.type === 'report' ? row.openReports : null,
    connectionId: row.connectionId,
    recipientRequested: row.requesterId === memberId,
    challengeId: row.challengeId,
    trend: row.trend,
    badge:
      row.badgeRow === null || row.badgeLevel === null
        ? null
        : {
            row: row.badgeRow,
            level: row.badgeLevel,
            eventName: row.eventName,
          },
  }
}

async function list(
  db: Database,
  reviewers: Reviewers,
  memberId: string,
  before: string | null,
  limit: number,
): Promise<NotificationRow[]> {
  const rows = await db
    .select({
      id: n.id,
      type: n.type,
      createdAt: n.createdAt,
      seenAt: n.seenAt,
      aboutMemberId: n.aboutMemberId,
      openReports: sql<number>`(select count(*)::int from ${reports} where ${reports.reportedId} = ${n.aboutMemberId} and ${reports.handledAt} is null)`,
      name: about.name,
      requestedName: about.requestedName,
      email: about.email,
      connectionId: n.connectionId,
      requesterId: request.requesterId,
      challengeId: n.challengeId,
      trend: trends.short,
      badgeRow: n.badgeRow,
      badgeLevel: n.badgeLevel,
      eventName: eventBadges.name,
    })
    .from(n)
    .innerJoin(about, eq(about.id, n.aboutMemberId))
    .leftJoin(request, eq(request.id, n.connectionId))
    .leftJoin(challenges, eq(challenges.id, n.challengeId))
    .leftJoin(eventBadges, eq(eventBadges.id, n.eventBadgeId))
    .leftJoin(
      trends,
      eq(
        trends.id,
        sql`coalesce(${challenges.trendId}, ${challenges.autoTrend})`,
      ),
    )
    .where(
      and(
        shown(reviewers, memberId),
        before === null ? undefined : olderThan(memberId, before),
      ),
    )
    .orderBy(desc(n.createdAt), desc(n.id))
    .limit(limit)
  return rows.map((row) => rowOf(row, memberId))
}

async function newCount(
  db: Database,
  reviewers: Reviewers,
  memberId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(n)
    .innerJoin(about, eq(about.id, n.aboutMemberId))
    .where(and(shown(reviewers, memberId), isNull(n.seenAt)))
  return row?.count ?? 0
}

// Every request between the two members of the one opened, either side.
function between(connectionId: string): SQL {
  return sql`${n.connectionId} in (
    select other.id from ${request} opened, ${request} other
    where opened.id = ${connectionId}
      and ((other.requester_id = opened.requester_id and other.target_id = opened.target_id)
        or (other.requester_id = opened.target_id and other.target_id = opened.requester_id)))`
}

async function markSeenWhere(
  db: Database,
  memberId: string,
  which: SQL | undefined,
): Promise<void> {
  await db
    .update(n)
    .set({ seenAt: sql`now()` })
    .where(and(eq(n.recipientId, memberId), which, isNull(n.seenAt)))
}

/** Notifications over Postgres (design §2). */
export function createNotificationStore(
  db: Database,
  reviewers: Reviewers,
): NotificationStore {
  return {
    list: (memberId, before, limit) =>
      list(db, reviewers, memberId, before, limit),
    newCount: (memberId) => newCount(db, reviewers, memberId),
    markSeen: (memberId, ids) =>
      markSeenWhere(db, memberId, inArray(n.id, [...ids])),
    // Each screen ends only the notifications that lead to it: the request
    // its request, the contact screen every new connection between the two.
    markSeenForConnection: (memberId, connectionId, contact) =>
      markSeenWhere(
        db,
        memberId,
        contact
          ? and(eq(n.type, 'new_connection'), between(connectionId))
          : and(
              eq(n.type, 'connection_request'),
              eq(n.connectionId, connectionId),
            ),
      ),
    markSeenForChallenge: (memberId, challengeId) =>
      markSeenWhere(
        db,
        memberId,
        and(eq(n.type, 'trend_challenge'), eq(n.challengeId, challengeId)),
      ),
    markSeenForApplicants: (memberId) =>
      markSeenWhere(db, memberId, eq(n.type, 'applicant')),
    markSeenForReports: (memberId, reportedId) =>
      markSeenWhere(
        db,
        memberId,
        and(eq(n.type, 'report'), eq(n.aboutMemberId, reportedId)),
      ),
    markSeenForBadges: (memberId, rows) =>
      markSeenWhere(
        db,
        memberId,
        and(eq(n.type, 'badge'), inArray(n.badgeRow, [...rows])),
      ),
  }
}
