import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import type { Pool } from '../db.js'
import type {
  ConnectionRecord,
  ConnectionStore,
  ConnectionView,
} from './connections.js'

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function recordOf(row: RowDataPacket): ConnectionRecord {
  return {
    id: String(row['id']),
    requesterId: String(row['requester_id']),
    targetId: String(row['target_id']),
    challengeId: text(row['challenge_id']),
    kind: row['kind'] as ConnectionRecord['kind'],
    message: text(row['message']),
    status: row['status'] as ConnectionRecord['status'],
    createdAt: (row['created_at'] as Date).toISOString(),
  }
}

function viewOf(row: RowDataPacket, viewerId: string): ConnectionView {
  const record = recordOf(row)
  const challengeId = text(row['ch_id'])
  return {
    id: record.id,
    direction: record.targetId === viewerId ? 'incoming' : 'outgoing',
    kind: record.kind,
    status: record.status,
    message: record.message,
    createdAt: record.createdAt,
    other: {
      memberId: String(row['other_id']),
      name: String(row['other_name']),
      jobTitle: text(row['other_job_title']),
      org: text(row['other_org']),
      sector: text(row['other_sector']),
    },
    challenge:
      challengeId === null
        ? null
        : {
            id: challengeId,
            body: String(row['ch_body']),
            trendShort: text(row['ch_trend']),
          },
  }
}

// The other party is whoever of the two is not the viewer. No email column is
// selected here, whatever the status (R-CONN-1).
const VIEW_SELECT =
  'SELECT r.*, o.id AS other_id, o.name AS other_name, ' +
  'o.job_title AS other_job_title, o.org AS other_org, o.sector AS other_sector, ' +
  'c.id AS ch_id, c.body AS ch_body, t.short AS ch_trend ' +
  'FROM connection_requests r ' +
  'JOIN members o ON o.id = IF(r.target_id = ?, r.requester_id, r.target_id) ' +
  'LEFT JOIN challenges c ON c.id = r.challenge_id ' +
  'LEFT JOIN trends t ON t.id = COALESCE(c.trend_id, c.auto_trend) '

async function views(
  pool: Pool,
  where: string,
  viewerId: string,
  params: unknown[],
): Promise<ConnectionView[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `${VIEW_SELECT} WHERE ${where} ORDER BY r.created_at DESC, r.id`,
    [viewerId, ...params],
  )
  return rows.map((row) => viewOf(row, viewerId))
}

async function contactFor(
  pool: Pool,
  id: string,
  viewerId: string,
): Promise<{ name: string; email: string } | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT o.name, o.email FROM connection_requests r ' +
      'JOIN members o ON o.id = IF(r.target_id = ?, r.requester_id, r.target_id) ' +
      "WHERE r.id = ? AND r.status = 'accepted' " +
      'AND (r.requester_id = ? OR r.target_id = ?)',
    [viewerId, id, viewerId, viewerId],
  )
  const row = rows[0]
  return row === undefined
    ? null
    : { name: String(row['name']), email: String(row['email']) }
}

// The pending_key unique index refuses a second pending request (migration
// 009); that refusal is the answer, not an error.
async function insertPending(
  pool: Pool,
  record: Omit<ConnectionRecord, 'status' | 'createdAt'>,
): Promise<boolean> {
  try {
    await pool.query(
      'INSERT INTO connection_requests (id, requester_id, target_id, ' +
        'challenge_id, kind, message) VALUES (?, ?, ?, ?, ?, ?)',
      [
        record.id,
        record.requesterId,
        record.targetId,
        record.challengeId,
        record.kind,
        record.message,
      ],
    )
    return true
  } catch (error) {
    if ((error as { code?: unknown }).code === 'ER_DUP_ENTRY') return false
    throw error
  }
}

// What a request is checked against before it is made.
function lookups(
  pool: Pool,
): Pick<ConnectionStore, 'isReachable' | 'challengeAuthor' | 'findPending'> {
  return {
    isReachable: async (memberId) => {
      const [rows] = await pool.query<RowDataPacket[]>(
        "SELECT 1 FROM members WHERE id = ? AND status = 'active' " +
          'AND name IS NOT NULL',
        [memberId],
      )
      return rows.length > 0
    },
    challengeAuthor: async (challengeId) => {
      const [rows] = await pool.query<RowDataPacket[]>(
        "SELECT member_id FROM challenges WHERE id = ? AND status = 'active'",
        [challengeId],
      )
      return text(rows[0]?.['member_id'])
    },
    findPending: async (requesterId, targetId, challengeId) => {
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM connection_requests WHERE requester_id = ? ' +
          "AND target_id = ? AND challenge_id <=> ? AND status = 'pending' LIMIT 1",
        [requesterId, targetId, challengeId],
      )
      return text(rows[0]?.['id'])
    },
  }
}

/** Connection requests over MySQL. The one query that reads an email checks
 * accepted status and party membership itself, so no caller can forget to
 * (R-CONN-3, R-CONN-6, ADR 0004). */
export function createMysqlConnectionStore(pool: Pool): ConnectionStore {
  return {
    ...lookups(pool),
    insert: (record) => insertPending(pool, record),
    find: async (id) => {
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT * FROM connection_requests WHERE id = ?',
        [id],
      )
      const row = rows[0]
      return row === undefined ? null : recordOf(row)
    },
    view: async (id, viewerId) =>
      (
        await views(
          pool,
          'r.id = ? AND (r.requester_id = ? OR r.target_id = ?)',
          viewerId,
          [id, viewerId, viewerId],
        )
      )[0] ?? null,
    incoming: (targetId) =>
      views(pool, "r.target_id = ? AND r.status = 'pending'", targetId, [
        targetId,
      ]),
    respond: async (id, targetId, status) => {
      const [result] = await pool.query<ResultSetHeader>(
        'UPDATE connection_requests SET status = ?, responded_at = UTC_TIMESTAMP() ' +
          "WHERE id = ? AND target_id = ? AND status = 'pending'",
        [status, id, targetId],
      )
      return result.affectedRows === 1
    },
    contactFor: (id, viewerId) => contactFor(pool, id, viewerId),
  }
}
