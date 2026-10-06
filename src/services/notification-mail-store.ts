import { and, eq, inArray, isNull, lt, lte, max, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Database } from '../db/connect.js'
import {
  challenges,
  connectionRequests,
  members,
  notificationSettings,
  notifications,
  trends,
} from '../db/schema.js'
import { DEFAULT_CADENCE, type Cadence } from './notification-cadence.js'
import type {
  DueNotification,
  NotificationMailStore,
} from './notification-worker.js'

const n = notifications
const recipient = alias(members, 'recipient')
const about = alias(members, 'about')
const request = connectionRequests
const chosen = notificationSettings

// Holds the waiting notifications due by `now` for this server: rows another
// server holds are locked or held, and passed by (R-NOTE-10).
async function claim(
  db: Database,
  now: Date,
  limit: number,
  holdUntil: Date,
): Promise<string[]> {
  return db.transaction(async (tx) => {
    const due = await tx
      .select({ id: n.id })
      .from(n)
      .where(
        and(
          eq(n.mailStatus, 'waiting'),
          or(isNull(n.nextAttemptAt), lte(n.nextAttemptAt, now)),
          or(isNull(n.claimedUntil), lte(n.claimedUntil, now)),
        ),
      )
      .orderBy(n.createdAt, n.id)
      .limit(limit)
      .for('update', { skipLocked: true })
    const ids = due.map((row) => row.id)
    if (ids.length > 0)
      await tx
        .update(n)
        .set({ claimedUntil: holdUntil })
        .where(inArray(n.id, ids))
    return ids
  })
}

interface ReadRow {
  id: string
  type: DueNotification['type']
  recipientId: string
  aboutMemberId: string | null
  connectionId: string | null
  createdAt: Date
  attempts: number
  seenAt: Date | null
  hidden: boolean
  recipientStatus: string
  aboutStatus: string
  aboutEmail: string
  requestStatus: DueNotification['requestStatus']
  cadence: Cadence | null
  challengeId: string | null
  challengeStatus: string | null
  trend: string | null
}

function dueOf(row: ReadRow): DueNotification {
  return {
    id: row.id,
    type: row.type,
    cadence: row.cadence ?? DEFAULT_CADENCE[row.type],
    recipientId: row.recipientId,
    aboutMemberId: row.aboutMemberId ?? '',
    connectionId: row.connectionId,
    createdAt: row.createdAt,
    attempts: row.attempts,
    seen: row.seenAt !== null,
    hidden: row.hidden,
    recipientActive: row.recipientStatus === 'active',
    aboutDeleted: row.aboutStatus === 'deleted',
    requestStatus: row.requestStatus,
    applicantStatus: row.type === 'applicant' ? row.aboutStatus : null,
    applicantEmail: row.type === 'applicant' ? row.aboutEmail : null,
    challengeId: row.challengeId,
    challengeActive: row.challengeStatus === 'active',
    trend: row.trend,
  }
}

function readRows(db: Database, ids: string[]): Promise<ReadRow[]> {
  return db
    .select({
      id: n.id,
      type: n.type,
      recipientId: n.recipientId,
      aboutMemberId: n.aboutMemberId,
      connectionId: n.connectionId,
      createdAt: n.createdAt,
      attempts: n.attempts,
      seenAt: n.seenAt,
      hidden: n.hidden,
      recipientStatus: recipient.status,
      aboutStatus: about.status,
      aboutEmail: about.email,
      requestStatus: request.status,
      cadence: chosen.cadence,
      challengeId: n.challengeId,
      challengeStatus: challenges.status,
      trend: trends.short,
    })
    .from(n)
    .innerJoin(recipient, eq(recipient.id, n.recipientId))
    .innerJoin(about, eq(about.id, n.aboutMemberId))
    .leftJoin(request, eq(request.id, n.connectionId))
    .leftJoin(challenges, eq(challenges.id, n.challengeId))
    .leftJoin(
      trends,
      eq(
        trends.id,
        sql`coalesce(${challenges.trendId}, ${challenges.autoTrend})`,
      ),
    )
    .leftJoin(
      chosen,
      and(eq(chosen.memberId, n.recipientId), eq(chosen.type, n.type)),
    )
    .where(inArray(n.id, ids))
    .orderBy(n.createdAt, n.id)
}

async function read(db: Database, ids: string[]): Promise<DueNotification[]> {
  if (ids.length === 0) return []
  return (await readRows(db, ids)).map(dueOf)
}

// When the member's last mail of a cadence went out, which starts its next
// window (R-NOTE-7).
async function lastMailed(
  db: Database,
  recipientId: string,
  cadence: string,
): Promise<Date | null> {
  const [row] = await db
    .select({ at: max(n.mailedAt) })
    .from(n)
    .where(and(eq(n.recipientId, recipientId), eq(n.mailedCadence, cadence)))
  return row?.at ?? null
}

// What every outcome leaves: no hold, and no time to go next.
const settled = { nextAttemptAt: null, claimedUntil: null }

/** The worker's reads and writes over `notifications` (design §1). */
export function createNotificationMailStore(
  db: Database,
): NotificationMailStore & { purgeBefore(cutoff: Date): Promise<number> } {
  const set = async (
    ids: readonly string[],
    values: Partial<typeof n.$inferInsert>,
  ): Promise<void> => {
    if (ids.length > 0)
      await db
        .update(n)
        .set(values)
        .where(inArray(n.id, [...ids]))
  }
  return {
    claimDue: async (now, limit, holdUntil) =>
      read(db, await claim(db, now, limit, holdUntil)),
    lastMailed: (recipientId, cadence) => lastMailed(db, recipientId, cadence),
    mailed: (ids, cadence, at) =>
      set(ids, {
        mailStatus: 'mailed',
        mailedAt: at,
        mailedCadence: cadence,
        ...settled,
      }),
    skipped: (id, reason) =>
      set([id], {
        mailStatus: 'skipped',
        skippedReason: reason,
        ...settled,
      }),
    deferUntil: (ids, at) => set(ids, { ...settled, nextAttemptAt: at }),
    retryAt: (ids, attempts, at) =>
      set(ids, { ...settled, attempts, nextAttemptAt: at }),
    failed: (ids, attempts) =>
      set(ids, { ...settled, mailStatus: 'failed', attempts }),
    // Kept a bounded time, like the outbound log (R-NOTE-11).
    purgeBefore: async (cutoff) => {
      const gone = await db
        .delete(n)
        .where(lt(n.createdAt, cutoff))
        .returning({ id: n.id })
      return gone.length
    },
  }
}
