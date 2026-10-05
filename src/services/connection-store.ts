import {
  and,
  desc,
  eq,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import {
  challenges,
  connectionRequests as r,
  members,
  trends,
} from '../db/schema.js'
import { challengeTrend } from './challenge-store.js'
import type {
  ConnectionRecord,
  ConnectionStatus,
  ConnectionStore,
  ConnectionView,
} from './connections.js'
import { companySizeLabel, sectorLabel } from './profile-labels.js'

function recordOf(row: typeof r.$inferSelect): ConnectionRecord {
  return {
    id: row.id,
    requesterId: row.requesterId,
    targetId: row.targetId,
    challengeId: row.challengeId,
    kind: row.kind,
    message: row.message,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  }
}

// The other party is whoever of the two is not the viewer.
const otherParty = (viewerId: string): SQL =>
  eq(
    members.id,
    sql`CASE WHEN ${r.targetId} = ${viewerId} THEN ${r.requesterId} ELSE ${r.targetId} END`,
  )

const isParty = (viewerId: string): SQL | undefined =>
  or(eq(r.requesterId, viewerId), eq(r.targetId, viewerId))

/** The other party of a request, joined only while they are an active
 * member: a deleted one is hidden everywhere during their grace period, email
 * included (ADR 0032). */
export const activeOtherParty = (viewerId: string): SQL | undefined =>
  and(otherParty(viewerId), eq(members.status, 'active'))

// Each party has their own mark: the requester's ends the accept notice
// (R-CONN-7), the target's the notice of a connection added (R-CONN-9).
function unseenBy(row: typeof r.$inferSelect, viewerId: string): boolean {
  if (row.status !== 'accepted') return false
  const seenAt =
    row.requesterId === viewerId ? row.requesterSeenAt : row.targetSeenAt
  return seenAt === null
}

const between = (a: string, b: string): SQL | undefined =>
  or(
    and(eq(r.requesterId, a), eq(r.targetId, b)),
    and(eq(r.requesterId, b), eq(r.targetId, a)),
  )

// No email column is selected for a view, whatever the status (R-CONN-1).
async function views(
  db: Database,
  where: SQL | undefined,
  viewerId: string,
): Promise<ConnectionView[]> {
  const rows = await db
    .select({
      request: r,
      other: {
        memberId: members.id,
        name: members.name,
        jobTitle: members.jobTitle,
        org: members.org,
        sector: sectorLabel,
        companySize: companySizeLabel,
      },
      challenge: { id: challenges.id, body: challenges.body },
      trendShort: trends.short,
    })
    .from(r)
    .innerJoin(members, activeOtherParty(viewerId))
    .leftJoin(challenges, eq(challenges.id, r.challengeId))
    .leftJoin(trends, eq(trends.id, challengeTrend))
    .where(where)
    .orderBy(desc(r.createdAt), r.id)
  return rows.map((row) => {
    const record = recordOf(row.request)
    return {
      id: record.id,
      direction: record.targetId === viewerId ? 'incoming' : 'outgoing',
      kind: record.kind,
      status: record.status,
      message: record.message,
      createdAt: record.createdAt,
      other: { ...row.other, name: row.other.name ?? '' },
      challenge:
        row.challenge === null
          ? null
          : { ...row.challenge, trendShort: row.trendShort },
      unseen: unseenBy(row.request, viewerId),
    }
  })
}

// The only read of an email in the whole double opt-in: it checks accepted
// status and that the reader is a party in the query itself (ADR 0004).
async function contactFor(
  db: Database,
  id: string,
  viewerId: string,
): Promise<{ name: string; email: string } | null> {
  const [row] = await db
    .select({ name: members.name, email: members.email })
    .from(r)
    .innerJoin(members, activeOtherParty(viewerId))
    .where(and(eq(r.id, id), eq(r.status, 'accepted'), isParty(viewerId)))
  return row === undefined ? null : { name: row.name ?? '', email: row.email }
}

// Only the first read counts, so the time says when the notice ended.
async function markSeen(
  db: Database,
  viewerId: string,
  otherId: string,
): Promise<void> {
  const accepted = eq(r.status, 'accepted')
  await db
    .update(r)
    .set({ requesterSeenAt: sql`now()` })
    .where(
      and(
        eq(r.requesterId, viewerId),
        eq(r.targetId, otherId),
        accepted,
        isNull(r.requesterSeenAt),
      ),
    )
  await db
    .update(r)
    .set({ targetSeenAt: sql`now()` })
    .where(
      and(
        eq(r.targetId, viewerId),
        eq(r.requesterId, otherId),
        accepted,
        isNull(r.targetSeenAt),
      ),
    )
}

// A request from someone deleted since cannot be answered (ADR 0032).
const requesterActive = sql`exists (select 1 from ${members} where ${members.id} = ${r.requesterId} and ${members.status} = 'active')`

// What a request is checked against before it is made.
function lookups(
  db: Database,
): Pick<ConnectionStore, 'isReachable' | 'challengeAuthor' | 'findPending'> {
  return {
    isReachable: async (memberId) => {
      const rows = await db
        .select({ id: members.id })
        .from(members)
        .where(
          and(
            eq(members.id, memberId),
            eq(members.status, 'active'),
            isNotNull(members.name),
          ),
        )
      return rows.length > 0
    },
    challengeAuthor: async (challengeId) => {
      const [row] = await db
        .select({ memberId: challenges.memberId })
        .from(challenges)
        .where(
          and(eq(challenges.id, challengeId), eq(challenges.status, 'active')),
        )
      return row?.memberId ?? null
    },
    findPending: async (requesterId, targetId, challengeId) => {
      const [row] = await db
        .select({ id: r.id })
        .from(r)
        .where(
          and(
            eq(r.requesterId, requesterId),
            eq(r.targetId, targetId),
            sql`${r.challengeId} IS NOT DISTINCT FROM ${challengeId}`,
            eq(r.status, 'pending'),
          ),
        )
        .limit(1)
      return row?.id ?? null
    },
  }
}

// What says the two have opted in to each other already (R-CONN-8).
function acceptedLookups(
  db: Database,
): Pick<ConnectionStore, 'isConnected' | 'findAccepted'> {
  return {
    isConnected: async (memberId, otherId) => {
      const rows = await db
        .select({ id: r.id })
        .from(r)
        .where(and(between(memberId, otherId), eq(r.status, 'accepted')))
        .limit(1)
      return rows.length > 0
    },
    findAccepted: async (memberId, otherId, challengeId) => {
      const [row] = await db
        .select({ id: r.id })
        .from(r)
        .where(
          and(
            between(memberId, otherId),
            sql`${r.challengeId} IS NOT DISTINCT FROM ${challengeId}`,
            eq(r.status, 'accepted'),
          ),
        )
        .orderBy(desc(r.createdAt), r.id)
        .limit(1)
      return row?.id ?? null
    },
  }
}

// The target has seen what they accept, so it is no news to them (R-CONN-9).
async function respond(
  db: Database,
  id: string,
  targetId: string,
  status: ConnectionStatus,
): Promise<boolean> {
  const answered = await db
    .update(r)
    .set({
      status,
      respondedAt: sql`now()`,
      ...(status === 'accepted' ? { targetSeenAt: sql`now()` } : {}),
    })
    .where(
      and(
        eq(r.id, id),
        eq(r.targetId, targetId),
        eq(r.status, 'pending'),
        requesterActive,
      ),
    )
    .returning({ id: r.id })
  return answered.length === 1
}

/** Connection requests over Postgres. The one query that reads an email
 * checks accepted status and party membership itself, so no caller can forget
 * to (R-CONN-3, R-CONN-6, ADR 0004). */
export function createConnectionStore(db: Database): ConnectionStore {
  return {
    ...lookups(db),
    ...acceptedLookups(db),
    // uq_pending refuses a second pending request (R-CONN-5); that refusal is
    // the answer, not an error.
    insert: async (record) => {
      const stored = await db
        .insert(r)
        .values(record)
        .onConflictDoNothing()
        .returning({ id: r.id })
      return stored.length === 1
    },
    insertAccepted: async (record) => {
      await db
        .insert(r)
        .values({ ...record, status: 'accepted', respondedAt: sql`now()` })
    },
    remove: async (id) => {
      await db.delete(r).where(eq(r.id, id))
    },
    find: async (id) => {
      const [row] = await db.select().from(r).where(eq(r.id, id))
      return row === undefined ? null : recordOf(row)
    },
    view: async (id, viewerId) =>
      (await views(db, and(eq(r.id, id), isParty(viewerId)), viewerId))[0] ??
      null,
    incoming: (targetId) =>
      views(
        db,
        and(eq(r.targetId, targetId), eq(r.status, 'pending')),
        targetId,
      ),
    connected: (memberId) =>
      views(db, and(eq(r.status, 'accepted'), isParty(memberId)), memberId),
    connectedOver: (viewerId, otherId) =>
      views(
        db,
        and(eq(r.status, 'accepted'), between(viewerId, otherId)),
        viewerId,
      ),
    respond: (id, targetId, status) => respond(db, id, targetId, status),
    contactFor: (id, viewerId) => contactFor(db, id, viewerId),
    markSeen: (viewerId, otherId) => markSeen(db, viewerId, otherId),
  }
}
