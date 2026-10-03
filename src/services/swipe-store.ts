import { and, eq, ne } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import { challenges, follows, swipes } from '../db/schema.js'
import { challengeTrend } from './challenge-store.js'
import type { SwipeStore } from './swipes.js'

/** Swipes and follows over Postgres (design §2). Recording twice is harmless:
 * a swipe is keyed by member, challenge and action. */
export function createSwipeStore(db: Database): SwipeStore {
  return {
    target: async (challengeId, viewerId) => {
      const [row] = await db
        .select({ authorId: challenges.memberId, trendId: challengeTrend })
        .from(challenges)
        .where(
          and(
            eq(challenges.id, challengeId),
            eq(challenges.status, 'active'),
            ne(challenges.memberId, viewerId),
          ),
        )
      return row === undefined || row.trendId === null
        ? null
        : { authorId: row.authorId, trendId: row.trendId }
    },
    record: async (memberId, challengeId, action) => {
      await db
        .insert(swipes)
        .values({ memberId, challengeId, action })
        .onConflictDoNothing()
    },
    follow: async (memberId, trendId) => {
      await db
        .insert(follows)
        .values({ memberId, trendId })
        .onConflictDoNothing()
    },
  }
}
