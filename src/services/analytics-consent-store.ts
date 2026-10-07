import { eq } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import { members } from '../db/schema.js'
import type { AnalyticsConsentStore } from './analytics-consent.js'

/** The analytics opt-in on `members` (design §2). */
export function createAnalyticsConsentStore(
  db: Database,
): AnalyticsConsentStore {
  return {
    record: async (memberId, version, at) => {
      await db
        .update(members)
        .set({ analyticsConsentVersion: version, analyticsConsentAt: at })
        .where(eq(members.id, memberId))
    },
    givenAt: async (memberId) => {
      const [row] = await db
        .select({ at: members.analyticsConsentAt })
        .from(members)
        .where(eq(members.id, memberId))
      return row?.at ?? null
    },
  }
}
