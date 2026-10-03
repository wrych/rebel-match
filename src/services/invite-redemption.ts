import { inviteState, type InviteState } from './invites.js'

/** Why an invite did not admit anyone, as analytics names it (design §7,
 * R-INV-5). The person never sees which one: the notice is the same. */
export type InviteRefusal =
  'unknown' | 'not_yet_valid' | 'expired' | 'revoked' | 'exhausted'

/** What redeeming an invite for an address came to. `address_taken` means
 * the address appeared meanwhile, so no seat was used and the request is
 * handled as for any existing address. */
export type Redemption =
  | { result: 'admitted' }
  | { result: 'refused'; refusal: InviteRefusal }
  | {
      result: 'address_taken'
    }

const refusals: Record<Exclude<InviteState, 'active'>, InviteRefusal> = {
  scheduled: 'not_yet_valid',
  expired: 'expired',
  revoked: 'revoked',
  exhausted: 'exhausted',
}

/** The refusal for an invite in this state, or null when it admits. */
export function refusalFor(
  ...args: Parameters<typeof inviteState>
): InviteRefusal | null {
  const state = inviteState(...args)
  return state === 'active' ? null : refusals[state]
}

/** Admits a new address through an invite in one step: checked usable at
 * `now`, never from a cache (R-INV-3), and the member, their role, the
 * invite that admitted them and the use counted together (R-INV-1,7,8). */
export type RedeemInvite = (
  email: string,
  token: string,
  now: Date,
) => Promise<Redemption>
