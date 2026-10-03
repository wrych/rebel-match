import { and, eq, inArray } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import { memberRoles, members } from '../db/schema.js'
import type { Holding, RevokeCheck, RoleGrantStore } from './roles.js'

/** The active holdings of these roles, locked until the transaction ends. */
export async function lockedHoldings(
  db: Database,
  roles: readonly string[],
): Promise<Holding[]> {
  if (roles.length === 0) return []
  const rows = await db
    .select({ memberId: memberRoles.memberId, role: memberRoles.roleKey })
    .from(memberRoles)
    .innerJoin(
      members,
      and(eq(members.id, memberRoles.memberId), eq(members.status, 'active')),
    )
    .where(inArray(memberRoles.roleKey, [...roles]))
    .for('update')
  return rows
}

async function revokeChecked(
  db: Database,
  holding: Holding,
  guardedRoles: readonly string[],
  mayRevoke: RevokeCheck,
): Promise<'revoked' | 'not_held' | 'refused'> {
  if (!mayRevoke(await lockedHoldings(db, guardedRoles))) return 'refused'

  const removed = await db
    .delete(memberRoles)
    .where(
      and(
        eq(memberRoles.memberId, holding.memberId),
        eq(memberRoles.roleKey, holding.role),
      ),
    )
    .returning({ memberId: memberRoles.memberId })
  return removed.length === 1 ? 'revoked' : 'not_held'
}

/** Role grants over `member_roles` (design §2). */
export function createRoleGrantStore(db: Database): RoleGrantStore {
  return {
    isActiveMember: async (memberId) => {
      const rows = await db
        .select({ id: members.id })
        .from(members)
        .where(and(eq(members.id, memberId), eq(members.status, 'active')))
      return rows.length > 0
    },
    grant: async (memberId, role, grantedBy) => {
      await db
        .insert(memberRoles)
        .values({ memberId, roleKey: role, grantedBy })
        .onConflictDoNothing()
    },
    revoke: (memberId, role, guardedRoles, mayRevoke) =>
      db.transaction((tx) =>
        revokeChecked(tx, { memberId, role }, guardedRoles, mayRevoke),
      ),
  }
}
