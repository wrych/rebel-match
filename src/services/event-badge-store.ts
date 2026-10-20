import { and, count, desc, eq, isNull, sql } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import { eventBadges, invites, memberEventBadges } from '../db/schema.js'
import { eventRow } from '../badges/rows.js'
import { insertBadgeNotification } from './notification-store.js'

/** An event badge a member earned, as their badges screen shows it. */
export interface EarnedEventBadge {
  id: string
  name: string
  ticketLine: string
  bigLine: string
  hasLogo: boolean
  earnedAt: string
  new: boolean
}

export interface EventBadgeStore {
  /** Earns the badge of the invite with this token when it is in its window
   * and not revoked, whatever its uses; anything else changes nothing
   * (R-BADGE-6, R-INV-5). True when the badge is newly the member's. */
  claim(memberId: string, token: string, now: Date): Promise<boolean>
  mine(memberId: string): Promise<EarnedEventBadge[]>
  newCount(memberId: string): Promise<number>
  markSeen(memberId: string): Promise<void>
}

/** Records an event badge as the member's, once, with its notification in
 * the caller's transaction (R-BADGE-6, R-NOTE-10). True when it is new. */
export async function earnEventBadge(
  db: Database,
  memberId: string,
  eventBadgeId: string,
): Promise<boolean> {
  const added = await db
    .insert(memberEventBadges)
    .values({ memberId, eventBadgeId })
    .onConflictDoNothing()
    .returning({ id: memberEventBadges.eventBadgeId })
  if (added.length === 1)
    await insertBadgeNotification(db, {
      recipientId: memberId,
      row: eventRow,
      level: 1,
      eventBadgeId,
    })
  return added.length === 1
}

// A claim is no use of the invite, so a full one still gives its badge
// (R-BADGE-6, R-INV-4).
async function claim(
  db: Database,
  memberId: string,
  token: string,
  now: Date,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [invite] = await tx
      .select({ badgeId: invites.eventBadgeId })
      .from(invites)
      .where(
        and(
          eq(invites.token, token),
          isNull(invites.revokedAt),
          sql`${invites.validFrom} <= ${now}`,
          sql`${invites.validUntil} > ${now}`,
        ),
      )
    return invite === undefined || invite.badgeId === null
      ? false
      : earnEventBadge(tx, memberId, invite.badgeId)
  })
}

async function mine(
  db: Database,
  memberId: string,
): Promise<EarnedEventBadge[]> {
  const rows = await db
    .select({
      id: eventBadges.id,
      name: eventBadges.name,
      ticketLine: eventBadges.ticketLine,
      bigLine: eventBadges.bigLine,
      hasLogo: sql<boolean>`${eventBadges.logoSvg} is not null`,
      earnedAt: memberEventBadges.earnedAt,
      seenAt: memberEventBadges.seenAt,
    })
    .from(memberEventBadges)
    .innerJoin(eventBadges, eq(eventBadges.id, memberEventBadges.eventBadgeId))
    .where(eq(memberEventBadges.memberId, memberId))
    .orderBy(desc(memberEventBadges.earnedAt), eventBadges.id)
  return rows.map(({ seenAt, earnedAt, ...badge }) => ({
    ...badge,
    earnedAt: earnedAt.toISOString(),
    new: seenAt === null,
  }))
}

const unseenOf = (memberId: string): ReturnType<typeof and> =>
  and(
    eq(memberEventBadges.memberId, memberId),
    isNull(memberEventBadges.seenAt),
  )

/** Event badges earned, over `member_event_badges` (design §2). */
export function createEventBadgeStore(db: Database): EventBadgeStore {
  return {
    claim: (memberId, token, now) => claim(db, memberId, token, now),
    mine: (memberId) => mine(db, memberId),
    newCount: async (memberId) => {
      const [unseen] = await db
        .select({ count: count() })
        .from(memberEventBadges)
        .where(unseenOf(memberId))
      return unseen?.count ?? 0
    },
    markSeen: async (memberId) => {
      await db
        .update(memberEventBadges)
        .set({ seenAt: new Date() })
        .where(unseenOf(memberId))
    },
  }
}
