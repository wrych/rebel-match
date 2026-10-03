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

/** Onboarding is complete only when a name and an acceptance of the current
 * consent version are both recorded; `requested_name` never counts, and an
 * older consent sends the member back to accept again (R-ONB-1, R-ONB-4,
 * R-AUTH-12). */
export function isOnboarded(
  row: {
    name: string | null
    consentVersion: string | null
    consentAt: Date | null
  },
  currentConsentVersion: string,
): boolean {
  return (
    row.name !== null &&
    row.consentAt !== null &&
    row.consentVersion === currentConsentVersion
  )
}

/** MemberProfiles over the `members` table, judged against the consent
 * version in force. */
export function createMysqlMemberProfiles(
  pool: Pool,
  currentConsentVersion: string,
): MemberProfiles {
  return {
    profile: async (memberId) => {
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT name, consent_version, consent_at FROM members WHERE id = ?',
        [memberId],
      )
      const row = rows[0]
      if (row === undefined) return null

      const name = (row['name'] as string | null) ?? null
      const consentVersion = (row['consent_version'] as string | null) ?? null
      const consentAt = (row['consent_at'] as Date | null) ?? null
      return {
        name,
        onboarded: isOnboarded(
          { name, consentVersion, consentAt },
          currentConsentVersion,
        ),
        consentVersion,
      }
    },
  }
}
