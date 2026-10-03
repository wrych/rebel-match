import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import type { Pool } from '../db.js'
import type { InviteStore, ListedInvite } from './invites.js'

function inviteOf(row: RowDataPacket): ListedInvite {
  return {
    id: String(row['id']),
    token: String(row['token']),
    label: String(row['label']),
    validFrom: row['valid_from'] as Date,
    validUntil: row['valid_until'] as Date,
    maxUses: Number(row['max_uses']),
    uses: Number(row['uses']),
    revokedAt: (row['revoked_at'] as Date | null) ?? null,
    createdBy: String(row['created_by']),
    creatorEmail: String(row['creator_email']),
    createdAt: row['created_at'] as Date,
  }
}

const SELECT_LISTED =
  'SELECT i.*, m.email AS creator_email FROM invites i ' +
  'JOIN members m ON m.id = i.created_by'

/** Invites over `invites` (design §2). Every read goes to the table, never a
 * cache, so a revocation holds on the next use (R-INV-3). */
export function createMysqlInviteStore(pool: Pool): InviteStore {
  return {
    list: async () => {
      const [rows] = await pool.query<RowDataPacket[]>(
        `${SELECT_LISTED} ORDER BY i.created_at DESC, i.id`,
      )
      return rows.map(inviteOf)
    },
    find: async (id) => {
      const [rows] = await pool.query<RowDataPacket[]>(
        `${SELECT_LISTED} WHERE i.id = ?`,
        [id],
      )
      const row = rows[0]
      return row === undefined ? null : inviteOf(row)
    },
    insert: async (invite) => {
      await pool.query(
        'INSERT INTO invites (id, token, label, valid_from, valid_until, ' +
          'max_uses, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          invite.id,
          invite.token,
          invite.label,
          invite.validFrom,
          invite.validUntil,
          invite.maxUses,
          invite.createdBy,
        ],
      )
    },
    revoke: async (id, at) => {
      const [result] = await pool.query<ResultSetHeader>(
        'UPDATE invites SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?',
        [at, id],
      )
      return result.affectedRows === 1
    },
  }
}
