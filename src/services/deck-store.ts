import { and, desc, eq, isNotNull, ne, notExists } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import { challenges, members, swipes, trends } from '../db/schema.js'
import { challengeTrend } from './challenge-store.js'
import type { DeckStore } from './deck.js'
import { companySizeLabel, sectorLabel } from './profile-labels.js'

const cardColumns = {
  challengeId: challenges.id,
  body: challenges.body,
  trendId: trends.id,
  short: trends.short,
  name: members.name,
  jobTitle: members.jobTitle,
  org: members.org,
  sector: sectorLabel,
  companySize: companySizeLabel,
}

/** The deck over Postgres. Selects no email column (R-CONN-6); the swipe
 * check runs in the query, so a swiped card cannot reappear (R-OFF-2). */
export function createDeckStore(db: Database): DeckStore {
  return {
    nextFor: async (viewerId, limit) => {
      const swiped = db
        .select({ challengeId: swipes.challengeId })
        .from(swipes)
        .where(
          and(
            eq(swipes.memberId, viewerId),
            eq(swipes.challengeId, challenges.id),
          ),
        )
      const rows = await db
        .select(cardColumns)
        .from(challenges)
        .innerJoin(members, eq(members.id, challenges.memberId))
        .innerJoin(trends, eq(trends.id, challengeTrend))
        .where(
          and(
            eq(challenges.status, 'active'),
            eq(members.status, 'active'),
            isNotNull(members.name),
            ne(challenges.memberId, viewerId),
            notExists(swiped),
          ),
        )
        .orderBy(desc(challenges.createdAt), challenges.id)
        .limit(limit)
      return rows.map((row) => ({
        challengeId: row.challengeId,
        body: row.body,
        trend: { id: row.trendId, short: row.short },
        author: {
          name: row.name ?? '',
          jobTitle: row.jobTitle,
          org: row.org,
          sector: row.sector,
          companySize: row.companySize,
        },
      }))
    },
  }
}
