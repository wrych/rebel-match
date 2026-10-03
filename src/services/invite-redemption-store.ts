import { randomUUID } from 'node:crypto'
import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from 'mysql2/promise'
import type { Pool } from '../db.js'
import {
  refusalFor,
  type Redemption,
  type RedeemInvite,
} from './invite-redemption.js'

async function admitLocked(
  db: PoolConnection,
  args: { email: string; token: string; now: Date; role: string },
): Promise<Redemption> {
  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT id, valid_from, valid_until, max_uses, uses, revoked_at, ' +
      'created_by FROM invites WHERE token = ? FOR UPDATE',
    [args.token],
  )
  const row = rows[0]
  if (row === undefined) return { result: 'refused', refusal: 'unknown' }

  const refusal = refusalFor(
    {
      validFrom: row['valid_from'] as Date,
      validUntil: row['valid_until'] as Date,
      maxUses: Number(row['max_uses']),
      uses: Number(row['uses']),
      revokedAt: (row['revoked_at'] as Date | null) ?? null,
    },
    args.now,
  )
  if (refusal !== null) return { result: 'refused', refusal }

  const memberId = randomUUID()
  const [inserted] = await db.query<ResultSetHeader>(
    'INSERT IGNORE INTO members (id, email, status, joined_via_invite_id, ' +
      "analytics_id) VALUES (?, ?, 'active', ?, ?)",
    [memberId, args.email, row['id'], randomUUID()],
  )
  if (inserted.affectedRows !== 1) return { result: 'address_taken' }

  await db.query(
    'INSERT INTO member_roles (member_id, role_key, granted_by) VALUES (?, ?, ?)',
    [memberId, args.role, row['created_by']],
  )
  await db.query('UPDATE invites SET uses = uses + 1 WHERE id = ?', [row['id']])
  return { result: 'admitted' }
}

/** Invite redemption over `invites`, `members` and `member_roles`. The invite
 * row is locked, so two scans cannot both take the last seat (R-INV-4). The
 * role is granted by whoever created the invite (R-ROLE-7). */
export function createMysqlInviteRedemption(
  pool: Pool,
  role: string,
): RedeemInvite {
  return async (email, token, now) => {
    const db = await pool.getConnection()
    try {
      await db.beginTransaction()
      const redemption = await admitLocked(db, { email, token, now, role })
      if (redemption.result === 'admitted') await db.commit()
      else await db.rollback()
      return redemption
    } catch (error) {
      await db.rollback()
      throw error
    } finally {
      db.release()
    }
  }
}
