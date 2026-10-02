import type { RowDataPacket } from 'mysql2/promise'
import type { Pool } from '../db.js'

/** What `/auth/me` says about a member beyond who they are (design §3). */
export interface MemberProfile {
  name: string | null
  onboarded: boolean
  consentVersion: string | null
}

export interface MemberProfiles {
  profile(memberId: string): Promise<MemberProfile | null>
}

/** Onboarding is complete only when both a name and consent are recorded;
 * `requested_name` never counts (R-ONB-1, R-AUTH-12). */
export function isOnboarded(row: {
  name: string | null
  consentAt: Date | null
}): boolean {
  return row.name !== null && row.consentAt !== null
}

/** MemberProfiles over the `members` table. */
export function createMysqlMemberProfiles(pool: Pool): MemberProfiles {
  return {
    profile: async (memberId) => {
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT name, consent_version, consent_at FROM members WHERE id = ?',
        [memberId],
      )
      const row = rows[0]
      if (row === undefined) return null

      const name = (row['name'] as string | null) ?? null
      const consentAt = (row['consent_at'] as Date | null) ?? null
      return {
        name,
        onboarded: isOnboarded({ name, consentAt }),
        consentVersion: (row['consent_version'] as string | null) ?? null,
      }
    },
  }
}
