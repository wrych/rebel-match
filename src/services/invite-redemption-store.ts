import { randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import { invites, memberRoles, members } from '../db/schema.js'
import {
  refusalFor,
  type Redemption,
  type RedeemInvite,
} from './invite-redemption.js'

async function admitLocked(
  db: Database,
  args: { email: string; token: string; now: Date; role: string },
): Promise<Redemption> {
  const [invite] = await db
    .select()
    .from(invites)
    .where(eq(invites.token, args.token))
    .for('update')
  if (invite === undefined) return { result: 'refused', refusal: 'unknown' }

  const refusal = refusalFor(invite, args.now)
  if (refusal !== null) return { result: 'refused', refusal }

  const memberId = randomUUID()
  const inserted = await db
    .insert(members)
    .values({
      id: memberId,
      email: args.email,
      status: 'active',
      joinedViaInviteId: invite.id,
      analyticsId: randomUUID(),
    })
    .onConflictDoNothing()
    .returning({ id: members.id })
  if (inserted.length !== 1) return { result: 'address_taken' }

  await db
    .insert(memberRoles)
    .values({ memberId, roleKey: args.role, grantedBy: invite.createdBy })
  await db
    .update(invites)
    .set({ uses: sql`${invites.uses} + 1` })
    .where(eq(invites.id, invite.id))
  return { result: 'admitted' }
}

/** Invite redemption over `invites`, `members` and `member_roles`. The invite
 * row is locked, so two scans cannot both take the last seat (R-INV-4). The
 * role is granted by whoever created the invite (R-ROLE-7). A refusal writes
 * nothing, so every outcome commits. */
export function createInviteRedemption(
  db: Database,
  role: string,
): RedeemInvite {
  return (email, token, now) =>
    db.transaction((tx) => admitLocked(tx, { email, token, now, role }))
}
