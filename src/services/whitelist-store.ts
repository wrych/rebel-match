import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import { memberRoles, members } from '../db/schema.js'
import type {
  StoredOutcome,
  StoredResult,
  WhitelistStore,
} from './whitelist.js'

async function grant(
  db: Database,
  memberId: string,
  role: string,
  grantedBy: string,
): Promise<void> {
  await db
    .insert(memberRoles)
    .values({ memberId, roleKey: role, grantedBy })
    .onConflictDoNothing()
}

async function addOne(
  db: Database,
  email: string,
  role: string,
  grantedBy: string,
): Promise<StoredOutcome> {
  const [created] = await db
    .insert(members)
    .values({
      id: randomUUID(),
      email,
      status: 'active',
      analyticsId: randomUUID(),
    })
    .onConflictDoNothing()
    .returning({ id: members.id })
  if (created !== undefined) {
    await grant(db, created.id, role, grantedBy)
    return 'added'
  }

  const [existing] = await db
    .select({ id: members.id, status: members.status })
    .from(members)
    .where(eq(members.email, email))
    .for('update')
  if (existing === undefined || existing.status === 'active')
    return 'already_active'
  if (existing.status !== 'applicant') return 'kept_out'

  await db
    .update(members)
    .set({ status: 'active' })
    .where(eq(members.id, existing.id))
  await grant(db, existing.id, role, grantedBy)
  return 'admitted'
}

/** The whitelist over `members` and `member_roles` (design §2). */
export function createWhitelistStore(db: Database): WhitelistStore {
  return {
    add: (emails, role, grantedBy) =>
      db.transaction(async (tx) => {
        const results: StoredResult[] = []
        for (const email of emails) {
          results.push({
            email,
            outcome: await addOne(tx, email, role, grantedBy),
          })
        }
        return results
      }),
  }
}
