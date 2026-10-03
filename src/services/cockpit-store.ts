import { and, count, desc, eq, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Database } from '../db/connect.js'
import {
  cases,
  challenges,
  connectionRequests,
  follows,
  memberExpertise,
  members,
  trends,
} from '../db/schema.js'
import { challengeTrend } from './challenge-store.js'
import type { CockpitStore } from './cockpit.js'
import type { FollowStore } from './follows.js'

// Interpolated into SQL an alias prints only its name, so each FROM below
// names the table before it.
const other = alias(challenges, 'other')
const peer = alias(members, 'peer')

// Counted the way the matches view lists them (R-ASK-8): other active,
// onboarded members, never the member themselves.
const isPeer = sql`${peer.status} = 'active' AND ${peer.name} IS NOT NULL
  AND ${peer.id} <> ${challenges.memberId}`

const sameBoat = sql<number>`(SELECT count(*)::int FROM ${challenges} ${other}
  JOIN ${members} ${peer} ON ${peer.id} = ${other.memberId}
  WHERE ${other.status} = 'active'
    AND coalesce(${other.trendId}, ${other.autoTrend}) = ${trends.id}
    AND ${isPeer})`

const beenThere = sql<number>`(SELECT count(*)::int FROM ${memberExpertise}
  JOIN ${members} ${peer} ON ${peer.id} = ${memberExpertise.memberId}
  WHERE ${memberExpertise.trendId} = ${trends.id} AND ${isPeer})`

const caseCount = sql<number>`(SELECT count(*)::int FROM ${cases}
  WHERE ${cases.trendId} = ${trends.id})`

/** The cockpit over Postgres (design §2). */
export function createCockpitStore(db: Database): CockpitStore {
  return {
    challenges: async (memberId) => {
      const rows = await db
        .select({
          id: challenges.id,
          body: challenges.body,
          trendId: trends.id,
          short: trends.short,
          sameBoat,
          beenThere,
          cases: caseCount,
        })
        .from(challenges)
        .leftJoin(trends, eq(trends.id, challengeTrend))
        .where(
          and(
            eq(challenges.memberId, memberId),
            eq(challenges.status, 'active'),
          ),
        )
        .orderBy(desc(challenges.createdAt), challenges.id)
      return rows.map((row) => ({
        id: row.id,
        body: row.body,
        trend:
          row.trendId === null
            ? null
            : { id: row.trendId, short: row.short ?? '' },
        counts: {
          sameBoat: row.sameBoat,
          beenThere: row.beenThere,
          cases: row.cases,
        },
      }))
    },
    pendingIncoming: async (memberId) => {
      const [row] = await db
        .select({ n: count() })
        .from(connectionRequests)
        .where(
          and(
            eq(connectionRequests.targetId, memberId),
            eq(connectionRequests.status, 'pending'),
          ),
        )
      return row?.n ?? 0
    },
  }
}

/** Follows over Postgres (design §2). */
export function createFollowStore(db: Database): FollowStore {
  return {
    follow: async (memberId, trendId) => {
      await db
        .insert(follows)
        .values({ memberId, trendId })
        .onConflictDoNothing()
    },
    unfollow: async (memberId, trendId) => {
      await db
        .delete(follows)
        .where(
          and(eq(follows.memberId, memberId), eq(follows.trendId, trendId)),
        )
    },
    followed: (memberId) =>
      db
        .select({
          id: trends.id,
          short: trends.short,
          from: trends.fromLabel,
          peers: trends.peers,
        })
        .from(follows)
        .innerJoin(trends, eq(trends.id, follows.trendId))
        .where(eq(follows.memberId, memberId))
        .orderBy(trends.id),
  }
}
