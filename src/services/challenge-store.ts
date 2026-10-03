import type { RowDataPacket } from 'mysql2/promise'
import type { Pool } from '../db.js'
import type {
  Challenge,
  ChallengeStore,
  PeerCard,
  StoredTrend,
} from './challenges.js'

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function challengeOf(row: RowDataPacket): Challenge {
  return {
    id: String(row['id']),
    memberId: String(row['member_id']),
    body: String(row['body']),
    trendId: text(row['trend_id']),
    autoTrend: text(row['auto_trend']),
    overridden: Number(row['overridden']) === 1,
    createdAt: (row['created_at'] as Date).toISOString(),
  }
}

function peerOf(row: RowDataPacket): PeerCard {
  return {
    memberId: String(row['member_id']),
    name: String(row['name']),
    jobTitle: text(row['job_title']),
    org: text(row['org']),
    sector: text(row['sector']),
    note: String(row['note'] ?? ''),
  }
}

// Peers are active, onboarded members: a name is what makes a card a person.
const PEER_COLUMNS = 'm.id AS member_id, m.name, m.job_title, m.org, m.sector'
const PEER_FILTER = "m.status = 'active' AND m.name IS NOT NULL AND m.id <> ?"

async function trendsOf(pool: Pool): Promise<StoredTrend[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT id, short, from_label, peers, keywords FROM trends ORDER BY id',
  )
  return rows.map((row) => ({
    id: String(row['id']),
    short: String(row['short']),
    from: String(row['from_label']),
    peers: Number(row['peers']),
    keywords: row['keywords'] as StoredTrend['keywords'],
  }))
}

async function peersOf(
  pool: Pool,
  trendId: string,
  viewerId: string,
): Promise<{ sameBoat: PeerCard[]; beenThere: PeerCard[] }> {
  const [same] = await pool.query<RowDataPacket[]>(
    `SELECT ${PEER_COLUMNS}, c.body AS note FROM challenges c ` +
      'JOIN members m ON m.id = c.member_id ' +
      "WHERE c.status = 'active' AND COALESCE(c.trend_id, c.auto_trend) = ? " +
      `AND ${PEER_FILTER} ORDER BY c.created_at DESC`,
    [trendId, viewerId],
  )
  const [been] = await pool.query<RowDataPacket[]>(
    `SELECT ${PEER_COLUMNS}, e.note FROM member_expertise e ` +
      'JOIN members m ON m.id = e.member_id ' +
      `WHERE e.trend_id = ? AND ${PEER_FILTER} ORDER BY m.name`,
    [trendId, viewerId],
  )
  return { sameBoat: same.map(peerOf), beenThere: been.map(peerOf) }
}

/** Challenges, trends and matches over MySQL (design §2). Peer cards select
 * no email column at all (R-CONN-6). */
export function createMysqlChallengeStore(pool: Pool): ChallengeStore {
  return {
    trends: () => trendsOf(pool),
    insert: async (challenge) => {
      await pool.query(
        'INSERT INTO challenges (id, member_id, body, auto_trend) ' +
          'VALUES (?, ?, ?, ?)',
        [challenge.id, challenge.memberId, challenge.body, challenge.autoTrend],
      )
    },
    find: async (id) => {
      const [rows] = await pool.query<RowDataPacket[]>(
        "SELECT * FROM challenges WHERE id = ? AND status = 'active'",
        [id],
      )
      const row = rows[0]
      return row === undefined ? null : challengeOf(row)
    },
    setTrend: async (id, trendId, overridden) => {
      await pool.query(
        'UPDATE challenges SET trend_id = ?, overridden = ? WHERE id = ?',
        [trendId, overridden ? 1 : 0, id],
      )
    },
    peers: (trendId, viewerId) => peersOf(pool, trendId, viewerId),
    cases: async (trendId) => {
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT org, url, takeaway FROM cases WHERE trend_id = ? ORDER BY id',
        [trendId],
      )
      return rows.map((row) => ({
        org: String(row['org']),
        url: String(row['url']),
        takeaway: String(row['takeaway']),
      }))
    },
  }
}
