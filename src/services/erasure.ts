import type { PermissionPolicy } from '../permissions.js'
import type { Holding } from './roles.js'

export type EraseOutcome =
  'erased' | 'not_found' | 'created_invites' | 'last_admin'

/** What deleting does now: the account set to be erased after the grace
 * period, or why it may not be deleted at all (ADR 0032). */
export type DeleteOutcome =
  | { result: 'scheduled'; eraseAfter: Date }
  | { result: Exclude<EraseOutcome, 'erased'> }

type GuardCheck = (holdings: readonly Holding[]) => boolean

/** Persistence for erasure. `erase` and `deactivate` run the check over the
 * locked holders of the guarded roles inside the transaction that changes the
 * member, so two of them cannot both pass it. */
export interface ErasureStore {
  erase(
    memberId: string,
    guardedRoles: readonly string[],
    mayErase: GuardCheck,
  ): Promise<EraseOutcome>
  /** Sets the member `deleted` with the time to erase them, keeping their
   * former status, and ends their sessions; an account already deleted keeps
   * its date. */
  deactivate(
    memberId: string,
    guardedRoles: readonly string[],
    mayErase: GuardCheck,
    plan: { eraseAfter: Date; bySelf: boolean },
  ): Promise<DeleteOutcome>
  /** Gives a deleted member their former status back; with `ownOnly`, only
   * an account the member deleted themselves. False when there was none. */
  restore(memberId: string, ownOnly: boolean): Promise<boolean>
  /** Deleted members whose time to be erased has come. */
  due(now: Date): Promise<string[]>
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
  /** Erases at once, as a host may when someone insists (R-NFR-7). */
  erase(memberId: string): Promise<EraseOutcome>
  /** Deletes with the grace period: hidden now, erased later (ADR 0032). */
  delete(memberId: string, bySelf: boolean): Promise<DeleteOutcome>
  /** A host's undo, for any deletion. */
  restore(memberId: string): Promise<boolean>
  /** The member's own undo, by the link emailed to them; only for an account
   * they deleted themselves. */
  restoreOwn(memberId: string): Promise<boolean>
  /** Erases every deleted account whose time has come; one that cannot be
   * erased now is tried again next time. Returns how many went. */
  eraseDue(): Promise<number>
}

const MS_PER_DAY = 86_400_000

/** GDPR erasure of one member and the personal data attached to them, after
 * a grace period in which it can be undone (R-NFR-7, R-MSG-6, ADR 0032),
 * decided by permission rather than role name (R-ROLE-3). */
export function createErasureService(deps: {
  store: ErasureStore
  policy: PermissionPolicy
  graceDays: () => number
  now?: () => Date
}): ErasureService {
  const now = deps.now ?? ((): Date => new Date())
  const guarded = (): readonly string[] =>
    deps.policy.rolesGranting('role:grant')
  const erase = (memberId: string): Promise<EraseOutcome> =>
    deps.store.erase(memberId, guarded(), (holdings) =>
      leavesAHolder(holdings, memberId),
    )

  return {
    erase,
    delete: (memberId, bySelf) =>
      deps.store.deactivate(
        memberId,
        guarded(),
        (holdings) => leavesAHolder(holdings, memberId),
        {
          eraseAfter: new Date(now().getTime() + deps.graceDays() * MS_PER_DAY),
          bySelf,
        },
      ),
    restore: (memberId) => deps.store.restore(memberId, false),
    restoreOwn: (memberId) => deps.store.restore(memberId, true),
    eraseDue: async () => {
      let erased = 0
      for (const memberId of await deps.store.due(now())) {
        if ((await erase(memberId)) === 'erased') erased += 1
      }
      return erased
    },
  }
}
