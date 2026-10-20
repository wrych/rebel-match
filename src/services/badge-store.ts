import { and, count, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import {
  badgeCrowns,
  badgeLaunch,
  challenges,
  connectionRequests,
  memberBadges,
  members,
  swipes,
} from '../db/schema.js'
import { countedRows, type CountedRow } from '../badges/rows.js'
import type { Standing } from '../badges/crowns.js'
import type { BadgeStore, Crown, EarnedLevel } from './badges.js'

// What each row counts, one row per counted act: whose it is, what it counts
// once (a challenge, a card, a request, a person) and when it happened
// (design §1 "Badges").
function acts(row: CountedRow): SQL {
  switch (row) {
    case 'speak':
      return sql`select ${challenges.memberId} as member, ${challenges.id} as item,
        ${challenges.createdAt} as at from ${challenges}
        where ${challenges.trendId} is not null and ${challenges.status} <> 'draft'`
    case 'help':
      return sql`select ${swipes.memberId} as member, ${swipes.challengeId} as item,
        ${swipes.createdAt} as at from ${swipes}
        where ${swipes.action} = 'been_there'`
    case 'boat':
      return sql`select ${connectionRequests.requesterId} as member,
        ${connectionRequests.id} as item, ${connectionRequests.createdAt} as at
        from ${connectionRequests} where ${connectionRequests.kind} = 'same_boat'`
    case 'connect':
      return sql`select ${connectionRequests.requesterId} as member,
        ${connectionRequests.targetId} as item, ${connectionRequests.respondedAt} as at
        from ${connectionRequests} where ${connectionRequests.status} = 'accepted'
        union all
        select ${connectionRequests.targetId}, ${connectionRequests.requesterId},
        ${connectionRequests.respondedAt}
        from ${connectionRequests} where ${connectionRequests.status} = 'accepted'`
  }
}

async function rowsOf<T extends Record<string, unknown>>(
  db: Database,
  query: SQL,
): Promise<T[]> {
  const result = (await db.execute(query)) as { rows: T[] }
  return result.rows
}

async function countFor(
  db: Database,
  memberId: string,
  row: CountedRow,
): Promise<number> {
  const [counted] = await rowsOf<{ count: number | string }>(
    db,
    sql`select count(distinct item) as count from (${acts(row)}) as acts
      where member = ${memberId}`,
  )
  return Number(counted?.count ?? 0)
}

async function standings(db: Database, row: CountedRow): Promise<Standing[]> {
  const ranked = await rowsOf<{
    member: string
    count: number | string
    reached: Date | string
  }>(
    db,
    sql`select acts.member, count(distinct acts.item) as count,
        max(acts.at) as reached
      from (${acts(row)}) as acts
      join ${members} on ${members.id} = acts.member and ${members.status} = 'active'
      group by acts.member`,
  )
  return ranked.map((each) => ({
    memberId: each.member,
    count: Number(each.count),
    reachedAt: new Date(each.reached),
  }))
}

async function crowns(db: Database): Promise<Crown[]> {
  const rows = await db.select().from(badgeCrowns)
  return rows.flatMap((row) =>
    isCounted(row.rowKey)
      ? [{ row: row.rowKey, memberId: row.memberId, seenAt: row.seenAt }]
      : [],
  )
}

async function setCrown(
  db: Database,
  row: CountedRow,
  memberId: string | null,
  seen: boolean,
): Promise<void> {
  const crown = {
    memberId,
    since: new Date(),
    seenAt: seen ? new Date() : null,
  }
  await db
    .insert(badgeCrowns)
    .values({ rowKey: row, ...crown })
    .onConflictDoUpdate({ target: badgeCrowns.rowKey, set: crown })
}

const isCounted = (key: string): key is CountedRow =>
  (countedRows as readonly string[]).includes(key)

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

async function newCount(db: Database, memberId: string): Promise<number> {
  const [levels] = await db
    .select({ count: count() })
    .from(memberBadges)
    .where(
      and(eq(memberBadges.memberId, memberId), isNull(memberBadges.seenAt)),
    )
  const [crowned] = await db
    .select({ count: count() })
    .from(badgeCrowns)
    .where(and(eq(badgeCrowns.memberId, memberId), isNull(badgeCrowns.seenAt)))
  return (levels?.count ?? 0) + (crowned?.count ?? 0)
}

async function markSeen(
  db: Database,
  memberId: string,
  rows: readonly CountedRow[],
): Promise<void> {
  if (rows.length === 0) return
  const now = new Date()
  await db
    .update(memberBadges)
    .set({ seenAt: now })
    .where(
      and(
        eq(memberBadges.memberId, memberId),
        inArray(memberBadges.rowKey, [...rows]),
        isNull(memberBadges.seenAt),
      ),
    )
  await db
    .update(badgeCrowns)
    .set({ seenAt: now })
    .where(
      and(
        eq(badgeCrowns.memberId, memberId),
        inArray(badgeCrowns.rowKey, [...rows]),
        isNull(badgeCrowns.seenAt),
      ),
    )
}

/** Badges over Postgres (design §2). Counts are read live from the records
 * they count; only the levels earned are kept. */
export function createBadgeStore(db: Database): BadgeStore {
  return {
    count: (memberId, row) => countFor(db, memberId, row),
    standings: (row) => standings(db, row),
    crowns: () => crowns(db),
    setCrown: (row, memberId, seen) => setCrown(db, row, memberId, seen),
    newCount: (memberId) => newCount(db, memberId),
    markSeen: (memberId, rows) => markSeen(db, memberId, rows),
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
