import { eq } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import { members } from '../db/schema.js'
import { isOptedIn } from './analytics-consent.js'
import type { ProfileStore } from './profile.js'

/** Profiles over `members` (design §2), judged against the analytics words
 * in force. */
export function createProfileStore(
  db: Database,
  analyticsVersion: string,
): ProfileStore {
  return {
    own: async (memberId) => {
      const [row] = await db
        .select()
        .from(members)
        .where(eq(members.id, memberId))
      if (row === undefined) return null
      return {
        name: row.name,
        jobTitle: row.jobTitle,
        org: row.org,
        email: row.email,
        consentVersion: row.consentVersion,
        consentAt: row.consentAt?.toISOString() ?? null,
        analyticsOptIn: isOptedIn(row, analyticsVersion),
      }
    },
    update: async (memberId, edit) => {
      await db
        .update(members)
        .set({
          name: edit.name,
          jobTitle: edit.jobTitle ?? null,
          org: edit.org ?? null,
        })
        .where(eq(members.id, memberId))
    },
  }
}
