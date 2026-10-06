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
  connectionRequests,
  memberRoles,
  members,
  notifications,
} from '../db/schema.js'
import type { NotificationRow, NotificationStore } from './notifications.js'

const n = notifications
const about = members
const request = connectionRequests

// Mail for these still goes out beside them, as before the worker existed,
// so the worker must never pick them up (ADR 0037).
const mailedAlready = { mailStatus: 'mailed' as const, mailedAt: sql`now()` }

function reviews(roles: readonly string[], memberId: unknown): SQL {
  return sql`exists (select 1 from ${memberRoles} where ${memberRoles.memberId} = ${memberId} and ${inArray(memberRoles.roleKey, [...roles])})`
}

// What R-NOTE-5 shows: not hidden, about nobody deleted, and an applicant
// notice only to someone who may still review applicants. Followed-trend
// notices are not written yet (tasks.md, M6).
function shown(roles: readonly string[], memberId: string): SQL | undefined {
  return and(
    eq(n.recipientId, memberId),
    eq(n.hidden, false),
    ne(n.type, 'trend_challenge'),
    ne(about.status, 'deleted'),
    or(ne(n.type, 'applicant'), reviews(roles, memberId)),
  )
}

async function addApplicant(
  db: Database,
  roles: readonly string[],
  email: string,
): Promise<void> {
  if (roles.length === 0) return
  await db.execute(sql`
    insert into ${n} (id, recipient_id, type, about_member_id, mail_status, mailed_at)
    select gen_random_uuid()::text, reviewer.id, 'applicant', applicant.id, 'mailed', now()
    from ${members} applicant, ${members} reviewer
    where applicant.email = ${email}
      and reviewer.status = 'active'
      and ${reviews(roles, sql`reviewer.id`)}`)
}

// After the member's own entry `id` in the list's order, compared in the
// database at full precision, so no row falls between two pages.
function olderThan(memberId: string, id: string): SQL {
  return sql`(${n.createdAt}, ${n.id}) < (select cursor.created_at, cursor.id from ${n} cursor where cursor.id = ${id} and cursor.recipient_id = ${memberId})`
}

async function list(
  db: Database,
  roles: readonly string[],
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
      name: about.name,
      requestedName: about.requestedName,
      email: about.email,
      connectionId: n.connectionId,
      requesterId: request.requesterId,
    })
    .from(n)
    .innerJoin(about, eq(about.id, n.aboutMemberId))
    .leftJoin(request, eq(request.id, n.connectionId))
    .where(
      and(
        shown(roles, memberId),
        before === null ? undefined : olderThan(memberId, before),
      ),
    )
    .orderBy(desc(n.createdAt), desc(n.id))
    .limit(limit)
  return rows.map((row) => ({
    id: row.id,
    type: row.type as NotificationRow['type'],
    createdAt: row.createdAt,
    seenAt: row.seenAt,
    aboutName:
      row.type === 'applicant'
        ? (row.requestedName ?? row.name ?? row.email)
        : (row.name ?? ''),
    connectionId: row.connectionId,
    recipientRequested: row.requesterId === memberId,
  }))
}

async function newCount(
  db: Database,
  roles: readonly string[],
  memberId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(n)
    .innerJoin(about, eq(about.id, n.aboutMemberId))
    .where(and(shown(roles, memberId), isNull(n.seenAt)))
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

/** Notifications over Postgres (design §2). `reviewerRoles` are the roles
 * granting `applicant:review`, read from the policy (R-ROLE-3). */
export function createNotificationStore(
  db: Database,
  reviewerRoles: readonly string[],
): NotificationStore {
  return {
    add: async (note) => {
      await db.insert(n).values({ id: randomUUID(), ...note, ...mailedAlready })
    },
    addApplicant: (email) => addApplicant(db, reviewerRoles, email),
    list: (memberId, before, limit) =>
      list(db, reviewerRoles, memberId, before, limit),
    newCount: (memberId) => newCount(db, reviewerRoles, memberId),
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
    markSeenForApplicants: (memberId) =>
      markSeenWhere(db, memberId, eq(n.type, 'applicant')),
  }
}
