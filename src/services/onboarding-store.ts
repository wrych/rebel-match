import { and, desc, eq } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import { members, outbox } from '../db/schema.js'
import type { OnboardingStore } from './onboarding.js'

/** Onboarding over `members` (design §2). `requested_name` and
 * `requested_org` only pre-fill; they are never copied without the member
 * submitting them (R-AUTH-12). */
export function createOnboardingStore(db: Database): OnboardingStore {
  return {
    draft: async (memberId) => {
      const [row] = await db
        .select()
        .from(members)
        .where(eq(members.id, memberId))
      if (row === undefined) return null
      return {
        name: row.name ?? row.requestedName,
        jobTitle: row.jobTitle,
        org: row.org ?? row.requestedOrg,
        sector: row.sector,
        companySize: row.companySize,
        analyticsVersion:
          row.analyticsConsentAt === null ? null : row.analyticsConsentVersion,
      }
    },
    save: async (memberId, input, acceptedAt) => {
      await db
        .update(members)
        .set({
          name: input.name,
          jobTitle: input.jobTitle ?? null,
          org: input.org ?? null,
          sector: input.sector ?? null,
          companySize: input.companySize ?? null,
          consentVersion: input.consentVersion,
          consentAt: acceptedAt,
          analyticsConsentVersion: input.analyticsVersion ?? null,
          analyticsConsentAt:
            input.analyticsVersion === undefined ? null : acceptedAt,
        })
        .where(eq(members.id, memberId))
    },
    signInEmailAt: async (memberId) => {
      const [row] = await db
        .select({ at: outbox.createdAt })
        .from(outbox)
        .where(
          and(eq(outbox.memberId, memberId), eq(outbox.kind, 'magic_link')),
        )
        .orderBy(desc(outbox.createdAt))
        .limit(1)
      return row?.at ?? null
    },
  }
}
