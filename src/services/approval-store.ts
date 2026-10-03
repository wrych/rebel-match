import { and, asc, eq } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import { memberRoles, members } from '../db/schema.js'
import type { ApprovalStore } from './approvals.js'

const isApplicant = (id: string): ReturnType<typeof and> =>
  and(eq(members.id, id), eq(members.status, 'applicant'))

async function admit(
  db: Database,
  id: string,
  role: string,
  approvedBy: string,
): Promise<string | null> {
  const [row] = await db
    .select({ email: members.email })
    .from(members)
    .where(isApplicant(id))
    .for('update')
  if (row === undefined) return null

  await db.update(members).set({ status: 'active' }).where(eq(members.id, id))
  await db
    .insert(memberRoles)
    .values({ memberId: id, roleKey: role, grantedBy: approvedBy })
    .onConflictDoNothing()
  return row.email
}

/** Approvals over `members` and `member_roles` (design §2). Approving locks
 * the applicant's row, so two hosts approving at once grant and email once. */
export function createApprovalStore(db: Database): ApprovalStore {
  return {
    listPending: async () => {
      const rows = await db
        .select()
        .from(members)
        .where(eq(members.status, 'applicant'))
        .orderBy(asc(members.createdAt), asc(members.email))
      return rows.map((row) => ({
        id: row.id,
        email: row.email,
        requestedAt: row.createdAt.toISOString(),
        name: row.requestedName,
        org: row.requestedOrg,
      }))
    },
    approve: (id, role, approvedBy) =>
      db.transaction((tx) => admit(tx, id, role, approvedBy)),
    reject: async (id) => {
      const rejected = await db
        .update(members)
        .set({ status: 'rejected' })
        .where(isApplicant(id))
        .returning({ id: members.id })
      return rejected.length === 1
    },
  }
}
