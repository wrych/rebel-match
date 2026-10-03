import { randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
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

/** Creates the address as a new active member, or locks the member who has
 * it: one statement, so no erasure can slip between finding and settling. A
 * no-op update is what makes Postgres return and lock an existing row. */
async function claim(
  db: Database,
  email: string,
): Promise<{ id: string; status: string; created: boolean }> {
  const [row] = await db
    .insert(members)
    .values({
      id: randomUUID(),
      email,
      status: 'active',
      analyticsId: randomUUID(),
    })
    .onConflictDoUpdate({
      target: members.email,
      set: { email: sql`excluded.email` },
    })
    .returning({
      id: members.id,
      status: members.status,
      created: sql<boolean>`xmax = 0`,
    })
  if (row === undefined) throw new Error('whitelist: insert returned no row')
  return row
}

async function addOne(
  db: Database,
  email: string,
  role: string,
  grantedBy: string,
): Promise<StoredOutcome> {
  const member = await claim(db, email)
  if (member.created) {
    await grant(db, member.id, role, grantedBy)
    return 'added'
  }
  if (member.status === 'active') return 'already_active'
  if (member.status !== 'applicant') return 'kept_out'
  await db
    .update(members)
    .set({ status: 'active' })
    .where(eq(members.id, member.id))
  await grant(db, member.id, role, grantedBy)
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
