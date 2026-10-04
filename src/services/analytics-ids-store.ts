import { eq } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import { members } from '../db/schema.js'
import type { AnalyticsIds } from './analytics.js'
import { isOptedIn } from './analytics-consent.js'

/** Analytics ids over `members`, released only for an opt-in to the words in
 * force (design §7). */
export function createAnalyticsIds(
  db: Database,
  currentVersion: string,
): AnalyticsIds {
  return {
    optedIn: async (memberId) => {
      const [row] = await db
        .select({
          analyticsId: members.analyticsId,
          analyticsConsentVersion: members.analyticsConsentVersion,
          analyticsConsentAt: members.analyticsConsentAt,
        })
        .from(members)
        .where(eq(members.id, memberId))
      return row !== undefined && isOptedIn(row, currentVersion)
        ? row.analyticsId
        : null
    },
  }
}
