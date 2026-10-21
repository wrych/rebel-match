import { randomUUID } from 'node:crypto'
import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  sql,
  type SQL,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Database } from '../db/connect.js'
import {
  challenges,
  connectionRequests,
  members,
  moderationActions,
  reports,
  trends,
} from '../db/schema.js'
import { challengeTrend } from './challenge-store.js'
import type { ModerationReason } from './challenge-moderation.js'
import {
  byAttention,
  type ModeratedItem,
  type ModerationAction,
  type ModerationItem,
  type ModerationPage,
  type ModerationStore,
  type ReportedMember,
} from './moderation.js'

const reporter = alias(members, 'reporter')
const actor = alias(members, 'actor')
const recipient = alias(members, 'recipient')

// A member with any open report is open; one whose reports are all handled
// is handled. The open tab counts open reports only (R-MOD-6).
function inTab(state: 'open' | 'handled'): ReturnType<typeof sql> {
  const anyOpen = sql`exists (select 1 from ${reports} open_report where open_report.reported_id = ${reports.reportedId} and open_report.handled_at is null)`
  return state === 'open'
    ? sql`${reports.handledAt} is null`
    : sql`not ${anyOpen}`
}

async function reasonsOf(
  db: Database,
  state: 'open' | 'handled',
  memberIds: string[],
): Promise<Map<string, ReportedMember['reasons']>> {
  if (memberIds.length === 0) return new Map()
  const rows = await db
    .select({
      memberId: reports.reportedId,
      reason: reports.reason,
      n: count(),
    })
    .from(reports)
    .where(and(inTab(state), inArray(reports.reportedId, memberIds)))
    .groupBy(reports.reportedId, reports.reason)
    .orderBy(desc(count()), reports.reason)
  const byMember = new Map<string, ReportedMember['reasons']>()
  for (const row of rows) {
    const list = byMember.get(row.memberId) ?? []
    list.push({ reason: row.reason, count: row.n })
    byMember.set(row.memberId, list)
  }
  return byMember
}

// More different reporters first, so many people reporting one member
// outrank one person reporting many times; then the latest (R-MOD-6).
async function overview(
  db: Database,
  state: 'open' | 'handled',
): Promise<ReportedMember[]> {
  const reporters = sql<number>`count(distinct ${reports.reporterId})::int`
  const latest = sql<Date>`max(${reports.createdAt})`
  const rows = await db
    .select({
      memberId: reports.reportedId,
      name: members.name,
      email: members.email,
      org: members.org,
      status: members.status,
      reports: count(),
      reporters,
      challenges: sql<number>`count(distinct ${reports.challengeId})::int`,
      // A note erased with its recipient counts by its report (R-MOD-11).
      notes: sql<number>`count(distinct case when ${reports.challengeId} is null then coalesce(${reports.requestId}, ${reports.id}) end)::int`,
      latestAt: latest,
    })
    .from(reports)
    .innerJoin(members, eq(members.id, reports.reportedId))
    .where(inTab(state))
    .groupBy(
      reports.reportedId,
      members.name,
      members.email,
      members.org,
      members.status,
    )
    .orderBy(
      state === 'open' ? desc(reporters) : desc(latest),
      desc(latest),
      reports.reportedId,
    )
  const reasons = await reasonsOf(
    db,
    state,
    rows.map((row) => row.memberId),
  )
  return rows.map((row) => ({
    ...row,
    latestAt: new Date(row.latestAt).toISOString(),
    reasons: reasons.get(row.memberId) ?? [],
  }))
}

function stateOf(row: {
  status: string | null
  hiddenAt: Date | null
}): ModerationItem['state'] {
  if (row.status === 'archived') return 'withdrawn'
  return row.hiddenAt === null ? 'shown' : 'hidden'
}

async function itemsOf(
  db: Database,
  memberId: string,
): Promise<ModerationItem[]> {
  const rows = await db
    .select({
      id: reports.id,
      challengeId: reports.challengeId,
      requestId: reports.requestId,
      noteText: reports.noteText,
      reason: reports.reason,
      comment: reports.comment,
      at: reports.createdAt,
      handledAt: reports.handledAt,
      reporter: reporter.name,
      body: challenges.body,
      status: challenges.status,
      hiddenAt: challenges.hiddenAt,
      hiddenReason: challenges.hiddenReason,
      trendShort: trends.short,
      note: connectionRequests.message,
      noteHiddenAt: connectionRequests.noteHiddenAt,
      noteHiddenReason: connectionRequests.noteHiddenReason,
      sentTo: recipient.name,
    })
    .from(reports)
    .leftJoin(reporter, eq(reporter.id, reports.reporterId))
    .leftJoin(challenges, eq(challenges.id, reports.challengeId))
    .leftJoin(trends, eq(trends.id, challengeTrend))
    .leftJoin(connectionRequests, eq(connectionRequests.id, reports.requestId))
    .leftJoin(recipient, eq(recipient.id, connectionRequests.targetId))
    .where(eq(reports.reportedId, memberId))
    .orderBy(desc(reports.createdAt), reports.id)
  const items = new Map<string, ModerationItem>()
  for (const row of rows) {
    const key = row.challengeId ?? row.requestId ?? row.id
    const item = items.get(key) ?? itemOf(row)
    item.reports.push({
      reason: row.reason,
      comment: row.comment,
      at: row.at.toISOString(),
      reporter: row.reporter,
      open: row.handledAt === null,
    })
    items.set(key, item)
  }
  return [...items.values()].sort(byAttention)
}

function itemOf(row: {
  id: string
  challengeId: string | null
  requestId: string | null
  noteText: string | null
  body: string | null
  status: string | null
  hiddenAt: Date | null
  hiddenReason: ModerationReason | null
  trendShort: string | null
  note: string | null
  noteHiddenAt: Date | null
  noteHiddenReason: ModerationReason | null
  sentTo: string | null
}): ModerationItem {
  if (row.challengeId !== null) {
    const state = stateOf(row)
    return {
      kind: 'challenge',
      id: row.challengeId,
      body: state === 'withdrawn' ? null : row.body,
      trendShort: row.trendShort,
      sentTo: null,
      state,
      hiddenReason: state === 'hidden' ? row.hiddenReason : null,
      reports: [],
    }
  }
  if (row.requestId === null)
    return {
      kind: 'note',
      id: row.id,
      body: row.noteText,
      trendShort: null,
      sentTo: null,
      state: 'erased',
      hiddenReason: null,
      reports: [],
    }
  return {
    kind: 'note',
    id: row.requestId,
    body: row.note,
    trendShort: null,
    sentTo: row.sentTo,
    state: row.noteHiddenAt === null ? 'shown' : 'hidden',
    hiddenReason: row.noteHiddenAt === null ? null : row.noteHiddenReason,
    reports: [],
  }
}

async function historyOf(
  db: Database,
  memberId: string,
): Promise<ModerationAction[]> {
  const rows = await db
    .select({
      kind: moderationActions.kind,
      actor: actor.name,
      at: moderationActions.createdAt,
      challengeId: moderationActions.challengeId,
      requestId: moderationActions.requestId,
      reason: moderationActions.reason,
      note: moderationActions.note,
    })
    .from(moderationActions)
    .leftJoin(actor, eq(actor.id, moderationActions.actorId))
    .where(eq(moderationActions.memberId, memberId))
    .orderBy(desc(moderationActions.createdAt), moderationActions.id)
  return rows.map((row) => ({
    kind: row.kind,
    actor: row.actor,
    at: row.at.toISOString(),
    item:
      row.challengeId !== null
        ? 'challenge'
        : row.requestId !== null
          ? 'note'
          : null,
    reason: row.reason,
    note: row.note,
  }))
}

// Different members by their ids, so two of the same name count twice and
// erased reporters not at all (R-MOD-7).
async function openOf(
  db: Database,
  memberId: string,
): Promise<ModerationPage['open']> {
  const [row] = await db
    .select({
      reports: count(),
      reporters: sql<number>`count(distinct ${reports.reporterId})::int`,
    })
    .from(reports)
    .where(and(eq(reports.reportedId, memberId), isNull(reports.handledAt)))
  return { reports: row?.reports ?? 0, reporters: row?.reporters ?? 0 }
}

// As many as the open tab lists (R-MOD-5, R-MOD-6).
async function openMembers(db: Database): Promise<number> {
  const [row] = await db
    .select({
      members: sql<number>`count(distinct ${reports.reportedId})::int`,
    })
    .from(reports)
    .where(isNull(reports.handledAt))
  return row?.members ?? 0
}

async function page(
  db: Database,
  memberId: string,
): Promise<ModerationPage | null> {
  const [member] = await db
    .select({
      id: members.id,
      name: members.name,
      email: members.email,
      org: members.org,
      status: members.status,
      createdAt: members.createdAt,
    })
    .from(members)
    .where(eq(members.id, memberId))
  if (member === undefined) return null
  const [items, history, open] = await Promise.all([
    itemsOf(db, memberId),
    historyOf(db, memberId),
    openOf(db, memberId),
  ])
  const { createdAt, ...rest } = member
  return {
    member: { ...rest, joinedAt: createdAt.toISOString() },
    open,
    items,
    history,
  }
}

const itemColumn = (item: ModeratedItem): ReturnType<typeof eq> => {
  if ('challengeId' in item) return eq(reports.challengeId, item.challengeId)
  if ('requestId' in item) return eq(reports.requestId, item.requestId)
  return eq(reports.id, item.reportId)
}

/** Marks the open reports about an item handled, in the caller's
 * transaction; the member they are about, or null when none were open
 * (R-MOD-7, R-MOD-8). */
export async function handleReports(
  tx: Database,
  item: ModeratedItem,
): Promise<string | null> {
  const handled = await tx
    .update(reports)
    .set({ handledAt: sql`now()` })
    .where(and(itemColumn(item), isNull(reports.handledAt)))
    .returning({ memberId: reports.reportedId })
  return handled[0]?.memberId ?? null
}

/** Records what a host did, for the member's history (R-MOD-11). */
export async function recordAction(
  tx: Database,
  action: {
    memberId: string
    actorId: string
    kind: ModerationAction['kind']
    item?: ModeratedItem
    reason?: ModerationReason
    note?: string
  },
): Promise<void> {
  const item = action.item
  await tx.insert(moderationActions).values({
    id: randomUUID(),
    memberId: action.memberId,
    actorId: action.actorId,
    kind: action.kind,
    challengeId:
      item !== undefined && 'challengeId' in item ? item.challengeId : null,
    requestId:
      item !== undefined && 'requestId' in item ? item.requestId : null,
    reason: action.reason ?? null,
    note: action.note ?? null,
  })
}

// A pending request whose note is hidden closes as a decline does, telling
// nobody (R-MOD-8, R-CONN-4).
function hideNote(
  db: Database,
  requestId: string,
  actorId: string,
  reason: ModerationReason,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const r = connectionRequests
    const [hidden] = await tx
      .update(r)
      .set({
        noteHiddenAt: sql`now()`,
        noteHiddenBy: actorId,
        noteHiddenReason: reason,
      })
      .where(
        and(eq(r.id, requestId), isNotNull(r.message), isNull(r.noteHiddenAt)),
      )
      .returning({ senderId: r.requesterId })
    if (hidden === undefined) return false
    await tx
      .update(r)
      .set({ status: 'declined', respondedAt: sql`now()` })
      .where(and(eq(r.id, requestId), eq(r.status, 'pending')))
    const item = { requestId }
    await handleReports(tx, item)
    await recordAction(tx, {
      memberId: hidden.senderId,
      actorId,
      kind: 'hide',
      item,
      reason,
    })
    return true
  })
}

function unhideNote(
  db: Database,
  requestId: string,
  actorId: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const r = connectionRequests
    const [shown] = await tx
      .update(r)
      .set({ noteHiddenAt: null, noteHiddenBy: null, noteHiddenReason: null })
      .where(and(eq(r.id, requestId), isNotNull(r.noteHiddenAt)))
      .returning({ senderId: r.requesterId })
    if (shown === undefined) return false
    await recordAction(tx, {
      memberId: shown.senderId,
      actorId,
      kind: 'unhide',
      item: { requestId },
    })
    return true
  })
}

// A report behind a measure is evidence for it: kept while the member is
// banned or the item hidden, and for the retention after either is lifted.
// Only dismissed reports go on the handling date alone (R-MOD-11, ADR 0056).
function noMeasureSince(cutoff: Date): SQL {
  return sql`not exists (select 1 from ${members} m where m.id = ${reports.reportedId} and m.status = 'banned')
    and not exists (select 1 from ${challenges} c where c.id = ${reports.challengeId} and c.hidden_at is not null)
    and not exists (select 1 from ${connectionRequests} q where q.id = ${reports.requestId} and q.note_hidden_at is not null)
    and not exists (select 1 from ${moderationActions} a where a.member_id = ${reports.reportedId} and a.created_at >= ${cutoff}
      and (a.kind = 'unban' or (a.kind = 'unhide' and (a.challenge_id = ${reports.challengeId} or a.request_id = ${reports.requestId}))))`
}

/** Reports and moderation over Postgres (design §2). */
export function createModerationStore(db: Database): ModerationStore {
  return {
    overview: (state) => overview(db, state),
    openMembers: () => openMembers(db),
    page: (memberId) => page(db, memberId),
    dismiss: (item, actorId) =>
      db.transaction(async (tx) => {
        const memberId = await handleReports(tx, item)
        if (memberId === null) return false
        await recordAction(tx, { memberId, actorId, kind: 'dismiss', item })
        return true
      }),
    hideNote: (requestId, actorId, reason) =>
      hideNote(db, requestId, actorId, reason),
    unhideNote: (requestId, actorId) => unhideNote(db, requestId, actorId),
    purgeHandledBefore: async (cutoff) => {
      const purged = await db
        .delete(reports)
        .where(and(lt(reports.handledAt, cutoff), noMeasureSince(cutoff)))
        .returning({ id: reports.id })
      return purged.length
    },
  }
}
