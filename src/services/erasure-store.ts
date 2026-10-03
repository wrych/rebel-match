import { eq, or, sql } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import { invites, members, outbox, sessions } from '../db/schema.js'
import type { EraseOutcome, ErasureStore } from './erasure.js'
import type { Holding } from './roles.js'
import { lockedHoldings } from './role-grant-store.js'

async function eraseChecked(
  db: Database,
  memberId: string,
  guardedRoles: readonly string[],
  mayErase: (holdings: readonly Holding[]) => boolean,
): Promise<EraseOutcome> {
  // The holders go first: locking them also locks their member rows, so two
  // erasures queue here in one order rather than deadlocking on each other.
  const holdings = await lockedHoldings(db, guardedRoles)
  const [member] = await db
    .select({ email: members.email })
    .from(members)
    .where(eq(members.id, memberId))
    .for('update')
  if (member === undefined) return 'not_found'

  // Invites have no cascade: a poster batch outlives the admin who made it,
  // so its creator is kept until the invites are dealt with (R-INV-8).
  const created = await db
    .select({ id: invites.id })
    .from(invites)
    .where(eq(invites.createdBy, memberId))
    .limit(1)
  if (created.length > 0) return 'created_invites'

  if (!mayErase(holdings)) return 'last_admin'

  await db
    .delete(outbox)
    .where(or(eq(outbox.memberId, memberId), eq(outbox.toEmail, member.email)))
  // Sessions hold the member id inside their data, with no foreign key.
  await db
    .delete(sessions)
    .where(sql`(${sessions.data})::jsonb ->> 'memberId' = ${memberId}`)
  // The rest goes by cascade: roles, tokens, challenges, expertise, follows,
  // swipes and connection requests on either side (design §2).
  await db.delete(members).where(eq(members.id, memberId))
  return 'erased'
}

/** Erasure over the members table and what hangs off it (design §2). */
export function createErasureStore(db: Database): ErasureStore {
  return {
    erase: (memberId, guardedRoles, mayErase) =>
      db.transaction((tx) =>
        eraseChecked(tx, memberId, guardedRoles, mayErase),
      ),
  }
}
