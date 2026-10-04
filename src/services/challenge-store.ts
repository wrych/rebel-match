import { and, asc, desc, eq, isNotNull, ne, sql, type SQL } from 'drizzle-orm'
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
  PeerCard,
  StoredTrend,
} from './challenges.js'
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
  row: Omit<PeerCard, 'name' | 'note'> & {
    name: string | null
    note: string | null
  },
): PeerCard {
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
): Promise<{ sameBoat: PeerCard[]; beenThere: PeerCard[] }> {
  const same = await db
    .select({ ...peerColumns, note: challenges.body })
    .from(challenges)
    .innerJoin(members, eq(members.id, challenges.memberId))
    .where(
      and(
        eq(challenges.status, 'active'),
        eq(challengeTrend, trendId),
        peerFilter(viewerId),
      ),
    )
    .orderBy(desc(challenges.createdAt))
  const been = await db
    .select({ ...peerColumns, note: memberExpertise.note })
    .from(memberExpertise)
    .innerJoin(members, eq(members.id, memberExpertise.memberId))
    .where(and(eq(memberExpertise.trendId, trendId), peerFilter(viewerId)))
    .orderBy(asc(members.name))
  return { sameBoat: same.map(peerOf), beenThere: been.map(peerOf) }
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
    setTrend: async (id, trendId, overridden) => {
      await db
        .update(challenges)
        .set({ trendId, overridden })
        .where(eq(challenges.id, id))
    },
    peers: (trendId, viewerId) => peersOf(db, trendId, viewerId),
    cases: (trendId) =>
      db
        .select({ org: cases.org, url: cases.url, takeaway: cases.takeaway })
        .from(cases)
        .where(eq(cases.trendId, trendId))
        .orderBy(cases.id),
  }
}
