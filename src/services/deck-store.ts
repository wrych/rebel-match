import type { RowDataPacket } from 'mysql2/promise'
import type { Pool } from '../db.js'
import type { DeckCard, DeckStore } from './deck.js'

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function cardOf(row: RowDataPacket): DeckCard {
  return {
    challengeId: String(row['id']),
    body: String(row['body']),
    trend: { id: String(row['trend_id']), short: String(row['short']) },
    author: {
      name: String(row['name']),
      jobTitle: text(row['job_title']),
      org: text(row['org']),
      sector: text(row['sector']),
    },
  }
}

/** The deck over MySQL. Selects no email column (R-CONN-6); the swipe check
 * runs in the query, so a swiped card cannot reappear (R-OFF-2). */
export function createMysqlDeckStore(pool: Pool): DeckStore {
  return {
    nextFor: async (viewerId, limit) => {
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT c.id, c.body, t.id AS trend_id, t.short, ' +
          'm.name, m.job_title, m.org, m.sector FROM challenges c ' +
          'JOIN members m ON m.id = c.member_id ' +
          'JOIN trends t ON t.id = COALESCE(c.trend_id, c.auto_trend) ' +
          "WHERE c.status = 'active' AND m.status = 'active' " +
          'AND m.name IS NOT NULL AND c.member_id <> ? ' +
          'AND NOT EXISTS (SELECT 1 FROM swipes s ' +
          'WHERE s.member_id = ? AND s.challenge_id = c.id) ' +
          'ORDER BY c.created_at DESC, c.id LIMIT ?',
        [viewerId, viewerId, limit],
      )
      return rows.map(cardOf)
    },
  }
}
