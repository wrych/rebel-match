import { randomUUID } from 'node:crypto'
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import type { Pool } from '../db.js'
import type { AdmissionStore, MemberStatus } from './admission.js'
import type { ReviewerDirectory } from './applicant-notice.js'

/** Admission's reads and writes over `members` (design §2). */
export function createMysqlAdmissionStore(pool: Pool): AdmissionStore {
  return {
    statusByEmail: async (email) => {
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT status FROM members WHERE email = ?',
        [email],
      )
      return (rows[0]?.['status'] as MemberStatus | undefined) ?? null
    },
    createApplicant: async (email) => {
      const [result] = await pool.query<ResultSetHeader>(
        'INSERT IGNORE INTO members (id, email, status, analytics_id) ' +
          "VALUES (?, ?, 'applicant', ?)",
        [randomUUID(), email, randomUUID()],
      )
      return result.affectedRows === 1
    },
    removeApplicant: async (email) => {
      await pool.query(
        "DELETE FROM members WHERE email = ? AND status = 'applicant'",
        [email],
      )
    },
  }
}

/** Reviewer addresses over `members` and `member_roles`. */
export function createMysqlReviewerDirectory(pool: Pool): ReviewerDirectory {
  return {
    emailsHolding: async (roles) => {
      if (roles.length === 0) return []
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT DISTINCT m.email FROM members m ' +
          'JOIN member_roles mr ON mr.member_id = m.id ' +
          "WHERE m.status = 'active' AND mr.role_key IN (?) ORDER BY m.email",
        [roles],
      )
      return rows.map((row) => String(row['email']))
    },
  }
}
