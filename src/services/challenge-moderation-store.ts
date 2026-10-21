import { and, desc, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import {
  challenges,
  connectionRequests,
  members,
  trends,
} from '../db/schema.js'
import { challengeTrend } from './challenge-store.js'
import type {
  ChallengeModerationStore,
  ModeratedChallenge,
  ModerationReason,
} from './challenge-moderation.js'

function stateOf(row: {
  status: string
  hiddenAt: Date | null
}): ModeratedChallenge['state'] {
  if (row.status === 'archived') return 'withdrawn'
  return row.hiddenAt === null ? 'shown' : 'hidden'
}

async function ofMember(
  db: Database,
  memberId: string,
): Promise<ModeratedChallenge[] | null> {
  const [member] = await db
    .select({ id: members.id })
    .from(members)
    .where(eq(members.id, memberId))
  if (member === undefined) return null
  const rows = await db
    .select({
      id: challenges.id,
      body: challenges.body,
      status: challenges.status,
      hiddenAt: challenges.hiddenAt,
      hiddenReason: challenges.hiddenReason,
      trendShort: trends.short,
      createdAt: challenges.createdAt,
    })
    .from(challenges)
    .leftJoin(trends, eq(trends.id, challengeTrend))
    .where(
      and(eq(challenges.memberId, memberId), ne(challenges.status, 'draft')),
    )
    .orderBy(desc(challenges.createdAt), challenges.id)
  return rows.map((row) => {
    const state = stateOf(row)
    return {
      id: row.id,
      body: state === 'withdrawn' ? null : row.body,
      trendShort: row.trendShort,
      state,
      hiddenReason: row.hiddenReason,
      createdAt: row.createdAt.toISOString(),
    }
  })
}

// Requests still waiting about it close as a decline does, telling nobody
// (R-MOD-8, R-CONN-4).
async function hide(
  db: Database,
  id: string,
  hiddenBy: string,
  reason: ModerationReason,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const hidden = await tx
      .update(challenges)
      .set({ hiddenAt: sql`now()`, hiddenBy, hiddenReason: reason })
      .where(and(eq(challenges.id, id), isNull(challenges.hiddenAt)))
      .returning({ id: challenges.id })
    if (hidden.length === 0) return false
    await tx
      .update(connectionRequests)
      .set({ status: 'declined', respondedAt: sql`now()` })
      .where(
        and(
          eq(connectionRequests.challengeId, id),
          eq(connectionRequests.status, 'pending'),
        ),
      )
    return true
  })
}

/** Hiding and showing challenges over Postgres (design §2). */
export function createChallengeModerationStore(
  db: Database,
): ChallengeModerationStore {
  return {
    ofMember: (memberId) => ofMember(db, memberId),
    hide: (id, hiddenBy, reason) => hide(db, id, hiddenBy, reason),
    unhide: async (id) => {
      const shown = await db
        .update(challenges)
        .set({ hiddenAt: null, hiddenBy: null, hiddenReason: null })
        .where(and(eq(challenges.id, id), isNotNull(challenges.hiddenAt)))
        .returning({ id: challenges.id })
      return shown.length === 1
    },
  }
}
