import { randomUUID } from 'node:crypto'
import { and, eq, inArray, sql } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import { memberRoles, members } from '../db/schema.js'
import type { AdmissionStore } from './admission.js'
import type { ReviewerDirectory } from './applicant-notice.js'

const isApplicant = (email: string): ReturnType<typeof and> =>
  and(eq(members.email, email), eq(members.status, 'applicant'))

/** Admission's reads and writes over `members` (design §2). */
export function createAdmissionStore(db: Database): AdmissionStore {
  return {
    statusByEmail: async (email) => {
      const [row] = await db
        .select({ status: members.status })
        .from(members)
        .where(eq(members.email, email))
      return row?.status ?? null
    },
    createApplicant: async (email) => {
      const created = await db
        .insert(members)
        .values({
          id: randomUUID(),
          email,
          status: 'applicant',
          analyticsId: randomUUID(),
        })
        .onConflictDoNothing()
        .returning({ id: members.id })
      return created.length === 1
    },
    removeApplicant: async (email) => {
      await db.delete(members).where(isApplicant(email))
    },
    describeApplicant: async (email, details) => {
      const described = await db
        .update(members)
        .set({
          requestedName: sql`coalesce(${details.name ?? null}, ${members.requestedName})`,
          requestedOrg: sql`coalesce(${details.org ?? null}, ${members.requestedOrg})`,
        })
        .where(isApplicant(email))
        .returning({ id: members.id })
      return described.length === 1
    },
  }
}

/** Reviewer addresses over `members` and `member_roles`. */
export function createReviewerDirectory(db: Database): ReviewerDirectory {
  return {
    emailsHolding: async (roles) => {
      if (roles.length === 0) return []
      const rows = await db
        .selectDistinct({ email: members.email })
        .from(members)
        .innerJoin(memberRoles, eq(memberRoles.memberId, members.id))
        .where(
          and(
            eq(members.status, 'active'),
            inArray(memberRoles.roleKey, [...roles]),
          ),
        )
        .orderBy(members.email)
      return rows.map((row) => row.email)
    },
  }
}
