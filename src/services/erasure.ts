import type { PermissionPolicy } from '../permissions.js'
import type { Holding } from './roles.js'

export type EraseOutcome =
  'erased' | 'not_found' | 'created_invites' | 'last_admin'

/** Persistence for erasure. `erase` runs `mayErase` over the locked holders of
 * the guarded roles inside the transaction that deletes, so two erasures
 * cannot both pass the check. */
export interface ErasureStore {
  erase(
    memberId: string,
    guardedRoles: readonly string[],
    mayErase: (holdings: readonly Holding[]) => boolean,
  ): Promise<EraseOutcome>
}

/** True when erasing this member leaves the guarded roles held, or when they
 * held none: erasure must never leave nobody able to grant roles (R-ROLE-9). */
export function leavesAHolder(
  holdings: readonly Holding[],
  memberId: string,
): boolean {
  return (
    !holdings.some((h) => h.memberId === memberId) ||
    holdings.some((h) => h.memberId !== memberId)
  )
}

export interface ErasureService {
  erase(memberId: string): Promise<EraseOutcome>
}

/** GDPR erasure of one member and the personal data attached to them
 * (R-NFR-7, R-MSG-6), decided by permission rather than role name (R-ROLE-3). */
export function createErasureService(deps: {
  store: ErasureStore
  policy: PermissionPolicy
}): ErasureService {
  return {
    erase: (memberId) =>
      deps.store.erase(
        memberId,
        deps.policy.rolesGranting('role:grant'),
        (holdings) => leavesAHolder(holdings, memberId),
      ),
  }
}
