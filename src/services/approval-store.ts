import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from 'mysql2/promise'
import type { Pool } from '../db.js'
import type { ApprovalStore } from './approvals.js'

async function admit(
  db: PoolConnection,
  id: string,
  role: string,
  approvedBy: string,
): Promise<string | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT email FROM members WHERE id = ? AND status = 'applicant' FOR UPDATE",
    [id],
  )
  const email = rows[0]?.['email'] as string | undefined
  if (email === undefined) return null

  await db.query("UPDATE members SET status = 'active' WHERE id = ?", [id])
  await db.query(
    'INSERT IGNORE INTO member_roles (member_id, role_key, granted_by) ' +
      'VALUES (?, ?, ?)',
    [id, role, approvedBy],
  )
  return email
}

async function approveLocked(
  pool: Pool,
  id: string,
  role: string,
  approvedBy: string,
): Promise<string | null> {
  const db = await pool.getConnection()
  try {
    await db.beginTransaction()
    const email = await admit(db, id, role, approvedBy)
    await db.commit()
    return email
  } catch (error) {
    await db.rollback()
    throw error
  } finally {
    db.release()
  }
}

/** Approvals over `members` and `member_roles` (design §2). Approving locks the
 * applicant's row, so two hosts approving at once grant and email once. */
export function createMysqlApprovalStore(pool: Pool): ApprovalStore {
  return {
    listPending: async () => {
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT id, email, created_at, requested_name, requested_org ' +
          "FROM members WHERE status = 'applicant' ORDER BY created_at, email",
      )
      return rows.map((row) => ({
        id: String(row['id']),
        email: String(row['email']),
        requestedAt: (row['created_at'] as Date).toISOString(),
        name: (row['requested_name'] as string | null) ?? null,
        org: (row['requested_org'] as string | null) ?? null,
      }))
    },
    approve: (id, role, approvedBy) =>
      approveLocked(pool, id, role, approvedBy),
    reject: async (id) => {
      const [result] = await pool.query<ResultSetHeader>(
        "UPDATE members SET status = 'rejected' " +
          "WHERE id = ? AND status = 'applicant'",
        [id],
      )
      return result.affectedRows === 1
    },
  }
}
