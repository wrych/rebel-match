import { and, eq, isNull } from 'drizzle-orm'
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
    claimOnboardingReport: async (memberId, at) => {
      const claimed = await db
        .update(members)
        .set({ onboardingReportedAt: at })
        .where(
          and(eq(members.id, memberId), isNull(members.onboardingReportedAt)),
        )
        .returning({ id: members.id })
      return claimed.length > 0
    },
  }
}
