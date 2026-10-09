import { and, desc, eq, isNotNull, ne, sql, type SQL } from 'drizzle-orm'
import { insertTrendNotifications } from './notification-store.js'
import type { Database } from '../db/connect.js'
import {
  cases,
  challenges,
  memberExpertise,
  members,
  trends,
} from '../db/schema.js'
import type {
  Challenge,
  ChallengeStore,
  NewestChallenge,
  StoredTrend,
} from './challenges.js'
import type { RankablePeer } from './match-ranker.js'
import { companySizeLabel, sectorLabel } from './profile-labels.js'

/** The trend a challenge sits in: the confirmed one, else the matcher's. */
export const challengeTrend = sql<
  string | null
>`coalesce(${challenges.trendId}, ${challenges.autoTrend})`

// Peers are active, onboarded members: a name is what makes a card a person.
// No email column is ever selected for a card (R-CONN-6).
const peerColumns = {
  memberId: members.id,
  name: members.name,
  jobTitle: members.jobTitle,
  org: members.org,
  sector: sectorLabel,
  companySize: companySizeLabel,
}

const peerFilter = (viewerId: string): SQL | undefined =>
  and(
    eq(members.status, 'active'),
    isNotNull(members.name),
    ne(members.id, viewerId),
  )

function peerOf(
  row: Omit<RankablePeer, 'name' | 'note'> & {
    name: string | null
    note: string | null
  },
): RankablePeer {
  return { ...row, name: row.name ?? '', note: row.note ?? '' }
}

async function trendsOf(db: Database): Promise<StoredTrend[]> {
  const rows = await db.select().from(trends).orderBy(trends.id)
  return rows.map((row) => ({
    id: row.id,
    short: row.short,
    from: row.fromLabel,
    peers: row.peers,
    keywords: row.keywords as StoredTrend['keywords'],
  }))
}

async function peersOf(
  db: Database,
  trendId: string,
  viewerId: string,
): Promise<{ sameBoat: RankablePeer[]; beenThere: RankablePeer[] }> {
  const same = await db
    .select({
      ...peerColumns,
      note: challenges.body,
      since: challenges.createdAt,
    })
    .from(challenges)
    .innerJoin(members, eq(members.id, challenges.memberId))
    .where(
      and(
        eq(challenges.status, 'active'),
        eq(challengeTrend, trendId),
        peerFilter(viewerId),
      ),
    )
  const been = await db
    .select({
      ...peerColumns,
      note: memberExpertise.note,
      since: memberExpertise.createdAt,
    })
    .from(memberExpertise)
    .innerJoin(members, eq(members.id, memberExpertise.memberId))
    .where(and(eq(memberExpertise.trendId, trendId), peerFilter(viewerId)))
  return { sameBoat: same.map(peerOf), beenThere: been.map(peerOf) }
}

// The deck's rule for whose challenges others may see (R-OFF-1); no member
// column is selected, so nothing tells who wrote one (R-ASK-14).
async function newestOf(
  db: Database,
  viewerId: string,
  trendId: string | null,
  limit: number,
): Promise<NewestChallenge[]> {
  const rows = await db
    .select({ body: challenges.body, id: trends.id, short: trends.short })
    .from(challenges)
    .innerJoin(members, eq(members.id, challenges.memberId))
    .innerJoin(trends, eq(trends.id, challengeTrend))
    .where(
      and(
        eq(challenges.status, 'active'),
        peerFilter(viewerId),
        trendId === null ? undefined : eq(trends.id, trendId),
      ),
    )
    .orderBy(desc(challenges.createdAt), challenges.id)
    .limit(limit)
  return rows.map((row) => ({
    body: row.body,
    trend: { id: row.id, short: row.short },
  }))
}

function challengeOf(row: typeof challenges.$inferSelect): Challenge {
  return {
    id: row.id,
    memberId: row.memberId,
    body: row.body,
    trendId: row.trendId,
    autoTrend: row.autoTrend,
    overridden: row.overridden,
    createdAt: row.createdAt.toISOString(),
  }
}

/** Challenges, trends and matches over Postgres (design §2). */
export function createChallengeStore(db: Database): ChallengeStore {
  return {
    trends: () => trendsOf(db),
    insert: async (challenge) => {
      await db.insert(challenges).values(challenge)
    },
    find: async (id) => {
      const [row] = await db
        .select()
        .from(challenges)
        .where(and(eq(challenges.id, id), eq(challenges.status, 'active')))
      return row === undefined ? null : challengeOf(row)
    },
    // A challenge is posted once its trend is first confirmed; the trend's
    // followers are told in the same transaction (R-ASK-9, R-NOTE-10).
    setTrend: (id, trendId, overridden) =>
      db.transaction(async (tx) => {
        const [before] = await tx
          .select({
            trendId: challenges.trendId,
            authorId: challenges.memberId,
          })
          .from(challenges)
          .where(eq(challenges.id, id))
          .for('update')
        await tx
          .update(challenges)
          .set({ trendId, overridden })
          .where(eq(challenges.id, id))
        if (before?.trendId === null)
          await insertTrendNotifications(tx, {
            id,
            authorId: before.authorId,
            trendId,
          })
      }),
    peers: (trendId, viewerId) => peersOf(db, trendId, viewerId),
    newest: (viewerId, trendId, limit) =>
      newestOf(db, viewerId, trendId, limit),
    cases: (trendId) =>
      db
        .select({ org: cases.org, url: cases.url, takeaway: cases.takeaway })
        .from(cases)
        .where(eq(cases.trendId, trendId))
        .orderBy(cases.id),
  }
}
