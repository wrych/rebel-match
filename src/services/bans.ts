import type { PermissionPolicy } from '../permissions.js'
import { leavesAHolder } from './erasure.js'
import type { Holding } from './roles.js'

/** Persistence for bans. `ban` runs the check over the locked holders of the
 * guarded roles inside the transaction that bans, so two bans cannot both
 * pass it, as for erasure. */
export interface BanStore {
  /** Bans an active member: their sessions end, their pending requests
   * either way close, their open reports are handled and the ban recorded,
   * in one transaction. */
  ban(
    ban: { memberId: string; actorId: string; note: string },
    guardedRoles: readonly string[],
    mayBan: (holdings: readonly Holding[]) => boolean,
  ): Promise<'banned' | 'not_found' | 'last_admin'>
  /** Makes a banned member active again, recording who did; false when
   * nobody with that id is banned. */
  unban(memberId: string, actorId: string): Promise<boolean>
}

export type BanOutcome = 'banned' | 'not_found' | 'self' | 'last_admin'

export interface BanService {
  ban(memberId: string, actorId: string, note: string): Promise<BanOutcome>
  unban(memberId: string, actorId: string): Promise<'unbanned' | 'not_found'>
}

/** Banning a member and lifting it (R-MOD-9). Nothing is erased: a ban hides
 * the member as deletion does and keeps everything for the lifting. A host
 * cannot ban themselves, or the last who can grant roles (R-ROLE-9). */
export function createBans(deps: {
  store: BanStore
  policy: PermissionPolicy
}): BanService {
  return {
    ban: async (memberId, actorId, note) => {
      if (memberId === actorId) return 'self'
      return deps.store.ban(
        { memberId, actorId, note },
        deps.policy.rolesGranting('role:grant'),
        (holdings) => leavesAHolder(holdings, memberId),
      )
    },
    unban: async (memberId, actorId) =>
      (await deps.store.unban(memberId, actorId)) ? 'unbanned' : 'not_found',
  }
}
