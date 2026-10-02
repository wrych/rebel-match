import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from 'mysql2/promise'
import type { Pool } from '../db.js'
import type { Holding, RevokeCheck, RoleGrantStore } from './roles.js'

async function lockedHoldings(
  db: PoolConnection,
  roles: readonly string[],
): Promise<Holding[]> {
  if (roles.length === 0) return []
  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT mr.member_id, mr.role_key FROM member_roles mr ' +
      "JOIN members m ON m.id = mr.member_id AND m.status = 'active' " +
      'WHERE mr.role_key IN (?) FOR UPDATE',
    [roles],
  )
  return rows.map((row) => ({
    memberId: String(row['member_id']),
    role: String(row['role_key']),
  }))
}

async function revokeChecked(
  db: PoolConnection,
  holding: Holding,
  guardedRoles: readonly string[],
  mayRevoke: RevokeCheck,
): Promise<'revoked' | 'not_held' | 'refused'> {
  if (!mayRevoke(await lockedHoldings(db, guardedRoles))) return 'refused'

  const [result] = await db.query<ResultSetHeader>(
    'DELETE FROM member_roles WHERE member_id = ? AND role_key = ?',
    [holding.memberId, holding.role],
  )
  return result.affectedRows === 1 ? 'revoked' : 'not_held'
}

/** Role grants over `member_roles` (design §2). */
export function createMysqlRoleGrantStore(pool: Pool): RoleGrantStore {
  return {
    isActiveMember: async (memberId) => {
      const [rows] = await pool.query<RowDataPacket[]>(
        "SELECT 1 FROM members WHERE id = ? AND status = 'active'",
        [memberId],
      )
      return rows.length > 0
    },
    grant: async (memberId, role, grantedBy) => {
      await pool.query(
        'INSERT IGNORE INTO member_roles (member_id, role_key, granted_by) ' +
          'VALUES (?, ?, ?)',
        [memberId, role, grantedBy],
      )
    },
    revoke: async (memberId, role, guardedRoles, mayRevoke) => {
      const db = await pool.getConnection()
      try {
        await db.beginTransaction()
        const outcome = await revokeChecked(
          db,
          { memberId, role },
          guardedRoles,
          mayRevoke,
        )
        await db.commit()
        return outcome
      } catch (error) {
        await db.rollback()
        throw error
      } finally {
        db.release()
      }
    },
  }
}
