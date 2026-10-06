import { randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import { insertApplicantNotifications } from './notification-store.js'
import { members } from '../db/schema.js'
import type { AdmissionStore } from './admission.js'

const isApplicant = (email: string): ReturnType<typeof and> =>
  and(eq(members.email, email), eq(members.status, 'applicant'))

async function ownDeletionOf(
  db: Database,
  email: string,
): Promise<Date | null> {
  const [row] = await db
    .select({ eraseAfter: members.eraseAfter })
    .from(members)
    .where(
      and(
        eq(members.email, email),
        eq(members.status, 'deleted'),
        eq(members.deletedBySelf, true),
      ),
    )
  return row?.eraseAfter ?? null
}

/** Admission's reads and writes over `members` (design §2). `reviewerRoles`
 * grant `applicant:review`, read from the policy (R-ROLE-3). */
export function createAdmissionStore(
  db: Database,
  reviewerRoles: readonly string[],
): AdmissionStore {
  return {
    statusByEmail: async (email) => {
      const [row] = await db
        .select({ status: members.status })
        .from(members)
        .where(eq(members.email, email))
      return row?.status ?? null
    },
    ownDeletion: (email) => ownDeletionOf(db, email),
    createApplicant: (email) =>
      db.transaction(async (tx) => {
        const [created] = await tx
          .insert(members)
          .values({
            id: randomUUID(),
            email,
            status: 'applicant',
            analyticsId: randomUUID(),
          })
          .onConflictDoNothing()
          .returning({ id: members.id })
        if (created === undefined) return false
        await insertApplicantNotifications(tx, reviewerRoles, created.id)
        return true
      }),
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
