import {
  and,
  count,
  countDistinct,
  eq,
  isNotNull,
  ne,
  or,
  sql,
} from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import {
  badgeLaunch,
  challenges,
  connectionRequests,
  memberBadges,
  members,
  swipes,
} from '../db/schema.js'
import { countedRows, type CountedRow } from '../badges/rows.js'
import type { BadgeStore, EarnedLevel } from './badges.js'

const otherParty = (memberId: string): SQL =>
  sql`case when ${connectionRequests.requesterId} = ${memberId}
    then ${connectionRequests.targetId} else ${connectionRequests.requesterId} end`

async function countFor(
  db: Database,
  memberId: string,
  row: CountedRow,
): Promise<number> {
  const counted = await countQuery(db, memberId, row)
  return counted[0]?.count ?? 0
}

// Each row counts records the app already keeps (design §1 "Badges").
function countQuery(
  db: Database,
  memberId: string,
  row: CountedRow,
): Promise<{ count: number }[]> {
  switch (row) {
    case 'speak':
      return db
        .select({ count: count() })
        .from(challenges)
        .where(
          and(
            eq(challenges.memberId, memberId),
            isNotNull(challenges.trendId),
            ne(challenges.status, 'draft'),
          ),
        )
    case 'help':
      return db
        .select({ count: count() })
        .from(swipes)
        .where(
          and(eq(swipes.memberId, memberId), eq(swipes.action, 'been_there')),
        )
    case 'boat':
      return db
        .select({ count: count() })
        .from(connectionRequests)
        .where(
          and(
            eq(connectionRequests.requesterId, memberId),
            eq(connectionRequests.kind, 'same_boat'),
          ),
        )
    case 'connect':
      return db
        .select({ count: countDistinct(otherParty(memberId)) })
        .from(connectionRequests)
        .where(
          and(
            eq(connectionRequests.status, 'accepted'),
            or(
              eq(connectionRequests.requesterId, memberId),
              eq(connectionRequests.targetId, memberId),
            ),
          ),
        )
  }
}

const isCounted = (key: string): key is CountedRow =>
  (countedRows as readonly string[]).includes(key)

async function activeMembers(db: Database): Promise<string[]> {
  const rows = await db
    .select({ id: members.id })
    .from(members)
    .where(eq(members.status, 'active'))
  return rows.map((row) => row.id)
}

async function award(
  db: Database,
  memberId: string,
  row: CountedRow,
  levels: readonly number[],
  seen: boolean,
): Promise<number[]> {
  if (levels.length === 0) return []
  const added = await db
    .insert(memberBadges)
    .values(
      levels.map((level) => ({
        memberId,
        rowKey: row,
        level,
        ...(seen ? { seenAt: new Date() } : {}),
      })),
    )
    .onConflictDoNothing()
    .returning({ level: memberBadges.level })
  return added.map((each) => each.level)
}

async function earned(db: Database, memberId: string): Promise<EarnedLevel[]> {
  const rows = await db
    .select()
    .from(memberBadges)
    .where(eq(memberBadges.memberId, memberId))
  return rows.flatMap((row) =>
    isCounted(row.rowKey)
      ? [
          {
            row: row.rowKey,
            level: row.level,
            earnedAt: row.earnedAt,
            seenAt: row.seenAt,
          },
        ]
      : [],
  )
}

/** Badges over Postgres (design §2). Counts are read live from the records
 * they count; only the levels earned are kept. */
export function createBadgeStore(db: Database): BadgeStore {
  return {
    count: (memberId, row) => countFor(db, memberId, row),
    everyCount: async (row) => {
      const counted = await Promise.all(
        (await activeMembers(db)).map(async (memberId) => ({
          memberId,
          count: await countFor(db, memberId, row),
        })),
      )
      return counted.filter((each) => each.count > 0)
    },
    award: (memberId, row, levels, seen) =>
      award(db, memberId, row, levels, seen),
    earned: (memberId) => earned(db, memberId),
    launched: async () =>
      (await db.select({ at: badgeLaunch.doneAt }).from(badgeLaunch).limit(1))
        .length > 0,
    markLaunched: async () => {
      await db.insert(badgeLaunch).values({ doneAt: new Date() })
    },
  }
}
