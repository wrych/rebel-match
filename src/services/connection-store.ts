import { and, desc, eq, isNotNull, or, sql, type SQL } from 'drizzle-orm'
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
    .innerJoin(members, otherParty(viewerId))
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
    .innerJoin(members, otherParty(viewerId))
    .where(and(eq(r.id, id), eq(r.status, 'accepted'), isParty(viewerId)))
  return row === undefined ? null : { name: row.name ?? '', email: row.email }
}

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

/** Connection requests over Postgres. The one query that reads an email
 * checks accepted status and party membership itself, so no caller can forget
 * to (R-CONN-3, R-CONN-6, ADR 0004). */
export function createConnectionStore(db: Database): ConnectionStore {
  return {
    ...lookups(db),
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
    respond: async (id, targetId, status) => {
      const answered = await db
        .update(r)
        .set({ status, respondedAt: sql`now()` })
        .where(
          and(eq(r.id, id), eq(r.targetId, targetId), eq(r.status, 'pending')),
        )
        .returning({ id: r.id })
      return answered.length === 1
    },
    contactFor: (id, viewerId) => contactFor(db, id, viewerId),
  }
}
