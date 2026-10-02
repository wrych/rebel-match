import type { PermissionPolicy } from '../permissions.js'

/** One role held by an active member. */
export interface Holding {
  memberId: string
  role: string
}

export type RevokeCheck = (holdings: readonly Holding[]) => boolean

/** Persistence for role grants. `revoke` runs `mayRevoke` over the current
 * holders of the guarded roles inside the same transaction that deletes, so two
 * revocations cannot both pass the check. */
export interface RoleGrantStore {
  isActiveMember(memberId: string): Promise<boolean>
  grant(memberId: string, role: string, grantedBy: string): Promise<void>
  revoke(
    memberId: string,
    role: string,
    guardedRoles: readonly string[],
    mayRevoke: RevokeCheck,
  ): Promise<'revoked' | 'not_held' | 'refused'>
}

export type GrantOutcome = 'granted' | 'unknown_role' | 'no_member'
export type RevokeOutcome =
  'revoked' | 'unknown_role' | 'not_held' | 'last_holder'

/** True when, after removing this holding, someone still holds a guarded role:
 * revoking must never leave nobody able to grant roles (R-ROLE-9). */
export function someoneStillHolds(
  holdings: readonly Holding[],
  removed: Holding,
): boolean {
  return holdings.some(
    (h) => !(h.memberId === removed.memberId && h.role === removed.role),
  )
}

export interface RoleService {
  grant(actorId: string, memberId: string, role: string): Promise<GrantOutcome>
  revoke(memberId: string, role: string): Promise<RevokeOutcome>
}

/** Grants and revokes roles under R-ROLE-9: only known roles, only to active
 * members, recording who granted (R-ROLE-7), and never the last holder of
 * `role:grant` — decided by permission, not by role name (R-ROLE-3). */
export function createRoleService(deps: {
  store: RoleGrantStore
  policy: PermissionPolicy
}): RoleService {
  return {
    grant: async (actorId, memberId, role) => {
      if (!deps.policy.knowsRole(role)) return 'unknown_role'
      if (!(await deps.store.isActiveMember(memberId))) return 'no_member'
      await deps.store.grant(memberId, role, actorId)
      return 'granted'
    },
    revoke: async (memberId, role) => {
      if (!deps.policy.knowsRole(role)) return 'unknown_role'
      const guarded = deps.policy.rolesGranting('role:grant')
      const outcome = await deps.store.revoke(
        memberId,
        role,
        guarded,
        (holdings) =>
          !guarded.includes(role) ||
          someoneStillHolds(holdings, { memberId, role }),
      )
      return outcome === 'refused' ? 'last_holder' : outcome
    },
  }
}
