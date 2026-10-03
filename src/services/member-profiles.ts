import { eq } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import { members } from '../db/schema.js'

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
export function createMemberProfiles(
  db: Database,
  currentConsentVersion: string,
): MemberProfiles {
  return {
    profile: async (memberId) => {
      const [row] = await db
        .select({
          name: members.name,
          consentVersion: members.consentVersion,
          consentAt: members.consentAt,
        })
        .from(members)
        .where(eq(members.id, memberId))
      if (row === undefined) return null

      return {
        name: row.name,
        onboarded: isOnboarded(row, currentConsentVersion),
        consentVersion: row.consentVersion,
      }
    },
  }
}
