import { and, desc, eq, lte, sql } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import { members, outbox } from '../db/schema.js'
import type { OnboardingStore } from './onboarding.js'

async function latestSignInEmailAt(
  db: Database,
  memberId: string,
  notAfter: Date,
): Promise<Date | null> {
  const [row] = await db
    .select({ at: outbox.createdAt })
    .from(outbox)
    .where(
      and(
        eq(outbox.memberId, memberId),
        eq(outbox.kind, 'magic_link'),
        lte(outbox.createdAt, notAfter),
      ),
    )
    .orderBy(desc(outbox.createdAt))
    .limit(1)
  return row?.at ?? null
}

async function lastConsent(
  db: Database,
  memberId: string,
): Promise<{ version: string; acceptedAt: Date; first: boolean } | null> {
  const [row] = await db
    .select({
      version: members.consentVersion,
      at: members.consentAt,
      firstAt: members.firstOnboardedAt,
    })
    .from(members)
    .where(eq(members.id, memberId))
  if (row === undefined || row.version === null || row.at === null) return null
  return {
    version: row.version,
    acceptedAt: row.at,
    first: row.firstAt?.getTime() === row.at.getTime(),
  }
}

/** Onboarding over `members` (design §2). `requested_name` and
 * `requested_org` only pre-fill the profile step of a member who has never
 * given a name; they are never copied without the member submitting them
 * (R-AUTH-12). */
export function createOnboardingStore(db: Database): OnboardingStore {
  return {
    draft: async (memberId) => {
      const [row] = await db
        .select()
        .from(members)
        .where(eq(members.id, memberId))
      if (row === undefined) return null
      const fromTheDoor = row.name === null
      return {
        name: row.name ?? row.requestedName,
        jobTitle: row.jobTitle,
        org: row.org ?? (fromTheDoor ? row.requestedOrg : null),
        sector: row.sector,
        companySize: row.companySize,
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
          firstOnboardedAt: sql`coalesce(${members.firstOnboardedAt}, ${acceptedAt})`,
        })
        .where(eq(members.id, memberId))
    },
    consent: (memberId) => lastConsent(db, memberId),
    signInEmailAt: (memberId, notAfter) =>
      latestSignInEmailAt(db, memberId, notAfter),
  }
}
