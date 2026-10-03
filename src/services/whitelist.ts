/** What adding one address did; design §3 says when each applies. */
export type WhitelistOutcome =
  'added' | 'admitted' | 'already_active' | 'kept_out'

export interface WhitelistResult {
  email: string
  outcome: WhitelistOutcome
}

export interface WhitelistStore {
  /** Adds each address in one transaction, granting `role` to everyone it
   * makes active and recording who granted it. */
  add(
    emails: readonly string[],
    role: string,
    grantedBy: string,
  ): Promise<WhitelistResult[]>
}

export interface WhitelistService {
  add(emails: readonly string[], actorId: string): Promise<WhitelistResult[]>
}

/** Pre-approves addresses, the pre-summit path for invited attendees (F10).
 * Nobody is emailed: a whitelisted person signs in when they arrive (F1), and
 * onboarding is where their consent is recorded (R-ONB-3). */
export function createWhitelist(deps: {
  store: WhitelistStore
  admittedRole: string
}): WhitelistService {
  return {
    add: (emails, actorId) =>
      deps.store.add([...new Set(emails)], deps.admittedRole, actorId),
  }
}
