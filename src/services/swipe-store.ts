import type { RowDataPacket } from 'mysql2/promise'
import type { Pool } from '../db.js'
import type { SwipeStore } from './swipes.js'

/** Swipes and follows over MySQL (design §2). Recording twice is harmless:
 * a swipe is keyed by member, challenge and action. */
export function createMysqlSwipeStore(pool: Pool): SwipeStore {
  return {
    target: async (challengeId, viewerId) => {
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT member_id, COALESCE(trend_id, auto_trend) AS trend_id ' +
          "FROM challenges WHERE id = ? AND status = 'active' AND member_id <> ?",
        [challengeId, viewerId],
      )
      const row = rows[0]
      return row === undefined || row['trend_id'] === null
        ? null
        : {
            authorId: String(row['member_id']),
            trendId: String(row['trend_id']),
          }
    },
    record: async (memberId, challengeId, action) => {
      await pool.query(
        'INSERT IGNORE INTO swipes (member_id, challenge_id, action) VALUES (?, ?, ?)',
        [memberId, challengeId, action],
      )
    },
    follow: async (memberId, trendId) => {
      await pool.query(
        'INSERT IGNORE INTO follows (member_id, trend_id) VALUES (?, ?)',
        [memberId, trendId],
      )
    },
  }
}
