import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import type { Pool } from '../db.js'
import type { AuthStore, SessionRecord, TokenRecord } from './store.js'
import type { LinkKind } from './types.js'

const MS_PER_SECOND = 1000

function toToken(row: RowDataPacket): TokenRecord {
  return {
    id: String(row['id']),
    memberId: String(row['member_id']),
    tokenHash: String(row['token_hash']),
    kind: row['kind'] as LinkKind,
    nextPath: String(row['next_path'] ?? '/'),
    expiresAt: row['expires_at'] as Date,
    usedAt: (row['used_at'] as Date | null) ?? null,
  }
}

function toSession(row: RowDataPacket): SessionRecord {
  const data = JSON.parse(String(row['data'])) as { memberId: string }
  return {
    idHash: String(row['session_id']),
    memberId: data.memberId,
    expiresAt: new Date(Number(row['expires']) * MS_PER_SECOND),
  }
}

async function activeMemberRoles(
  pool: Pool,
  memberId: string,
): Promise<string[] | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT mr.role_key FROM members m ' +
      'LEFT JOIN member_roles mr ON mr.member_id = m.id ' +
      "WHERE m.id = ? AND m.status = 'active'",
    [memberId],
  )
  if (rows.length === 0) return null

  return rows.flatMap((row) =>
    row['role_key'] === null ? [] : [String(row['role_key'])],
  )
}

async function insertToken(pool: Pool, token: TokenRecord): Promise<void> {
  await pool.query(
    'INSERT INTO magic_tokens ' +
      '(id, member_id, token_hash, kind, next_path, expires_at, used_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      token.id,
      token.memberId,
      token.tokenHash,
      token.kind,
      token.nextPath,
      token.expiresAt,
      token.usedAt,
    ],
  )
}

async function selectOne(
  pool: Pool,
  sql: string,
  key: string,
): Promise<RowDataPacket | null> {
  const [rows] = await pool.query<RowDataPacket[]>(sql, [key])
  return rows[0] ?? null
}

function sessionQueries(
  pool: Pool,
): Pick<
  AuthStore,
  'insertSession' | 'findSession' | 'extendSession' | 'deleteSession'
> {
  return {
    insertSession: async (session) => {
      await pool.query(
        'INSERT INTO sessions (session_id, expires, data) VALUES (?, ?, ?)',
        [
          session.idHash,
          Math.floor(session.expiresAt.getTime() / MS_PER_SECOND),
          JSON.stringify({ memberId: session.memberId }),
        ],
      )
    },
    findSession: async (idHash) => {
      const row = await selectOne(
        pool,
        'SELECT * FROM sessions WHERE session_id = ?',
        idHash,
      )
      return row === null ? null : toSession(row)
    },
    extendSession: async (idHash, expiresAt) => {
      await pool.query('UPDATE sessions SET expires = ? WHERE session_id = ?', [
        Math.floor(expiresAt.getTime() / MS_PER_SECOND),
        idHash,
      ])
    },
    deleteSession: async (idHash) => {
      await pool.query('DELETE FROM sessions WHERE session_id = ?', [idHash])
    },
  }
}

/** The AuthStore over MySQL: `magic_tokens` and `sessions`, plus the two reads
 * of `members` the seam needs to know who a credential belongs to. */
export function createMysqlAuthStore(pool: Pool): AuthStore {
  return {
    memberIdByEmail: async (email) => {
      const row = await selectOne(
        pool,
        'SELECT id FROM members WHERE email = ?',
        email,
      )
      return row === null ? null : String(row['id'])
    },
    activeMemberRoles: (memberId) => activeMemberRoles(pool, memberId),
    insertToken: (token) => insertToken(pool, token),
    findToken: async (tokenHash) => {
      const row = await selectOne(
        pool,
        'SELECT * FROM magic_tokens WHERE token_hash = ?',
        tokenHash,
      )
      return row === null ? null : toToken(row)
    },
    markTokenUsed: async (id, at) => {
      const [result] = await pool.query<ResultSetHeader>(
        'UPDATE magic_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL',
        [at, id],
      )
      return result.affectedRows === 1
    },
    ...sessionQueries(pool),
  }
}
