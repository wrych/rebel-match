import { and, eq, isNull, or, sql } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import {
  badgeCrowns,
  connectionRequests,
  members,
  reports,
} from '../db/schema.js'
import type { BanStore } from './bans.js'
import { endSessions } from './erasure-store.js'
import { recordAction } from './moderation-store.js'
import { lockedHoldings } from './role-grant-store.js'

// Everything else of theirs is hidden by their status, as a deleted
// member's is, and returns when the ban is lifted (R-MOD-9).
async function banChecked(
  tx: Database,
  ban: Parameters<BanStore['ban']>[0],
  guardedRoles: readonly string[],
  mayBan: Parameters<BanStore['ban']>[2],
): ReturnType<BanStore['ban']> {
  // The holders go first, in the order erasure locks them (R-ROLE-9).
  const holdings = await lockedHoldings(tx, guardedRoles)
  const [member] = await tx
    .select({ status: members.status })
    .from(members)
    .where(eq(members.id, ban.memberId))
    .for('update')
  if (member?.status !== 'active') return 'not_found'
  if (!mayBan(holdings)) return 'last_admin'

  await tx
    .update(members)
    .set({ status: 'banned' })
    .where(eq(members.id, ban.memberId))
  await endSessions(tx, ban.memberId)
  // A crown goes to nobody, as for a deleted member (R-BADGE-3).
  await tx
    .update(badgeCrowns)
    .set({ memberId: null, since: new Date(), seenAt: null })
    .where(eq(badgeCrowns.memberId, ban.memberId))
  // Closed as a decline is, telling nobody (R-CONN-4).
  const r = connectionRequests
  await tx
    .update(r)
    .set({ status: 'declined', respondedAt: sql`now()` })
    .where(
      and(
        eq(r.status, 'pending'),
        or(eq(r.requesterId, ban.memberId), eq(r.targetId, ban.memberId)),
      ),
    )
  await tx
    .update(reports)
    .set({ handledAt: sql`now()` })
    .where(and(eq(reports.reportedId, ban.memberId), isNull(reports.handledAt)))
  await recordAction(tx, {
    memberId: ban.memberId,
    actorId: ban.actorId,
    kind: 'ban',
    note: ban.note,
  })
  return 'banned'
}

/** Bans over Postgres (design §2). */
export function createBanStore(db: Database): BanStore {
  return {
    ban: (ban, guardedRoles, mayBan) =>
      db.transaction((tx) => banChecked(tx, ban, guardedRoles, mayBan)),
    unban: (memberId, actorId) =>
      db.transaction(async (tx) => {
        const lifted = await tx
          .update(members)
          .set({ status: 'active' })
          .where(and(eq(members.id, memberId), eq(members.status, 'banned')))
          .returning({ id: members.id })
        if (lifted.length === 0) return false
        await recordAction(tx, { memberId, actorId, kind: 'unban' })
        return true
      }),
  }
}
