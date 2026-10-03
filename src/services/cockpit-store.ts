import type { RowDataPacket } from 'mysql2/promise'
import type { Pool } from '../db.js'
import type { Trend } from './challenges.js'
import type { CockpitChallenge, CockpitStore } from './cockpit.js'
import type { FollowStore } from './follows.js'

// Counted the way the matches view lists them (R-ASK-8): other active,
// onboarded members, never the member themselves.
const COUNTS =
  '(SELECT COUNT(*) FROM challenges o JOIN members m ON m.id = o.member_id ' +
  "WHERE o.status = 'active' AND COALESCE(o.trend_id, o.auto_trend) = t.id " +
  "AND m.status = 'active' AND m.name IS NOT NULL AND m.id <> c.member_id) AS same_boat, " +
  '(SELECT COUNT(*) FROM member_expertise e JOIN members m ON m.id = e.member_id ' +
  "WHERE e.trend_id = t.id AND m.status = 'active' AND m.name IS NOT NULL " +
  'AND m.id <> c.member_id) AS been_there, ' +
  '(SELECT COUNT(*) FROM cases k WHERE k.trend_id = t.id) AS cases'

function cockpitChallengeOf(row: RowDataPacket): CockpitChallenge {
  const trendId = row['trend_id'] as string | null
  return {
    id: String(row['id']),
    body: String(row['body']),
    trend:
      trendId === null ? null : { id: trendId, short: String(row['short']) },
    counts: {
      sameBoat: Number(row['same_boat'] ?? 0),
      beenThere: Number(row['been_there'] ?? 0),
      cases: Number(row['cases'] ?? 0),
    },
  }
}

/** The cockpit over MySQL (design §2). */
export function createMysqlCockpitStore(pool: Pool): CockpitStore {
  return {
    challenges: async (memberId) => {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT c.id, c.body, t.id AS trend_id, t.short, ${COUNTS} ` +
          'FROM challenges c ' +
          'LEFT JOIN trends t ON t.id = COALESCE(c.trend_id, c.auto_trend) ' +
          "WHERE c.member_id = ? AND c.status = 'active' " +
          'ORDER BY c.created_at DESC, c.id',
        [memberId],
      )
      return rows.map(cockpitChallengeOf)
    },
    pendingIncoming: async (memberId) => {
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT COUNT(*) AS n FROM connection_requests ' +
          "WHERE target_id = ? AND status = 'pending'",
        [memberId],
      )
      return Number(rows[0]?.['n'] ?? 0)
    },
  }
}

/** Follows over MySQL (design §2). */
export function createMysqlFollowStore(pool: Pool): FollowStore {
  return {
    follow: async (memberId, trendId) => {
      await pool.query(
        'INSERT IGNORE INTO follows (member_id, trend_id) VALUES (?, ?)',
        [memberId, trendId],
      )
    },
    unfollow: async (memberId, trendId) => {
      await pool.query(
        'DELETE FROM follows WHERE member_id = ? AND trend_id = ?',
        [memberId, trendId],
      )
    },
    followed: async (memberId) => {
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT t.id, t.short, t.from_label, t.peers FROM follows f ' +
          'JOIN trends t ON t.id = f.trend_id WHERE f.member_id = ? ORDER BY t.id',
        [memberId],
      )
      return rows.map((row): Trend => ({
        id: String(row['id']),
        short: String(row['short']),
        from: String(row['from_label']),
        peers: Number(row['peers']),
      }))
    },
  }
}
