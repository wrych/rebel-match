import { and, count, eq, gt, ne, sql } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import {
  challenges,
  connectionRequests,
  members,
  reports,
  trends,
} from '../db/schema.js'
import { challengeTrend, isShown } from './challenge-store.js'
import { insertReportNotifications } from './notification-store.js'
import type {
  ReportItem,
  ReportOutcome,
  ReportStore,
  ReportTarget,
} from './reports.js'

interface Resolved {
  reportedId: string
  target: Omit<ReportTarget, 'alreadyReported'>
  pendingRequest: boolean
}

// A challenge is reportable by anyone but its author while it was ever
// posted and its author is not deleted; its text only while others see it
// (R-MOD-1, R-MOD-4, R-NAV-8).
async function challengeOf(
  db: Database,
  reporterId: string,
  challengeId: string,
): Promise<Resolved | null> {
  const [row] = await db
    .select({
      authorId: challenges.memberId,
      body: challenges.body,
      shown: isShown(),
      trendShort: trends.short,
    })
    .from(challenges)
    .innerJoin(members, eq(members.id, challenges.memberId))
    .leftJoin(trends, eq(trends.id, challengeTrend))
    .where(
      and(
        eq(challenges.id, challengeId),
        ne(challenges.status, 'draft'),
        ne(challenges.memberId, reporterId),
        ne(members.status, 'deleted'),
      ),
    )
  if (row === undefined) return null
  return {
    reportedId: row.authorId,
    target: {
      kind: 'challenge',
      body: row.shown ? row.body : null,
      trendShort: row.trendShort,
    },
    pendingRequest: false,
  }
}

// Only the member a note was sent to may report it (R-MOD-2).
async function noteOf(
  db: Database,
  reporterId: string,
  requestId: string,
): Promise<Resolved | null> {
  const r = connectionRequests
  const [row] = await db
    .select({ requesterId: r.requesterId, body: r.message, status: r.status })
    .from(r)
    .innerJoin(members, eq(members.id, r.requesterId))
    .where(
      and(
        eq(r.id, requestId),
        eq(r.targetId, reporterId),
        ne(members.status, 'deleted'),
      ),
    )
  if (row === undefined || row.body === null) return null
  return {
    reportedId: row.requesterId,
    target: { kind: 'note', body: row.body, trendShort: null },
    pendingRequest: row.status === 'pending',
  }
}

function resolve(
  db: Database,
  reporterId: string,
  item: ReportItem,
): Promise<Resolved | null> {
  return 'challengeId' in item
    ? challengeOf(db, reporterId, item.challengeId)
    : noteOf(db, reporterId, item.requestId)
}

function sameItem(
  reporterId: string,
  item: ReportItem,
): ReturnType<typeof and> {
  return and(
    eq(reports.reporterId, reporterId),
    'challengeId' in item
      ? eq(reports.challengeId, item.challengeId)
      : eq(reports.requestId, item.requestId),
  )
}

async function targetFor(
  db: Database,
  reporterId: string,
  item: ReportItem,
): Promise<ReportTarget | null> {
  const found = await resolve(db, reporterId, item)
  if (found === null) return null
  const [already] = await db
    .select({ n: count() })
    .from(reports)
    .where(sameItem(reporterId, item))
  return { ...found.target, alreadyReported: (already?.n ?? 0) > 0 }
}

async function reportsToday(db: Database, reporterId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(reports)
    .where(
      and(
        eq(reports.reporterId, reporterId),
        gt(reports.createdAt, sql`now() - interval '1 day'`),
      ),
    )
  return row?.n ?? 0
}

// A reported pending request is declined, telling nobody (R-MOD-4,
// R-CONN-4); the hosts are told with the report (R-MOD-5, R-NOTE-10).
function record(
  db: Database,
  reviewerRoles: readonly string[],
  report: Parameters<ReportStore['record']>[0],
): Promise<ReportOutcome> {
  return db.transaction(async (tx) => {
    const found = await resolve(tx, report.reporterId, report.item)
    if (found === null) return 'not_found'
    if ((await reportsToday(tx, report.reporterId)) >= report.perDay)
      return 'too_many'
    const inserted = await tx
      .insert(reports)
      .values({
        id: report.id,
        reporterId: report.reporterId,
        reportedId: found.reportedId,
        challengeId:
          'challengeId' in report.item ? report.item.challengeId : null,
        requestId: 'requestId' in report.item ? report.item.requestId : null,
        reason: report.reason,
        comment: report.comment,
      })
      .onConflictDoNothing()
      .returning({ id: reports.id })
    if (inserted.length === 0) return 'already_reported'
    await insertReportNotifications(tx, reviewerRoles, {
      reportedId: found.reportedId,
      reporterId: report.reporterId,
    })
    if (found.pendingRequest && 'requestId' in report.item)
      await tx
        .update(connectionRequests)
        .set({ status: 'declined', respondedAt: sql`now()` })
        .where(
          and(
            eq(connectionRequests.id, report.item.requestId),
            eq(connectionRequests.status, 'pending'),
          ),
        )
    return 'reported'
  })
}

/** Reports over Postgres (design §2). `reviewerRoles` are the roles
 * granting `report:review`, told of each report (R-MOD-5). */
export function createReportStore(
  db: Database,
  reviewerRoles: readonly string[],
): ReportStore {
  return {
    challengeTarget: (reporterId, challengeId) =>
      targetFor(db, reporterId, { challengeId }),
    noteTarget: (reporterId, requestId) =>
      targetFor(db, reporterId, { requestId }),
    record: (report) => record(db, reviewerRoles, report),
  }
}
