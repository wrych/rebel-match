import type { AuthProvider } from '../auth/index.js'

/** What adding one address did; design §3 says when each applies. */
export type WhitelistOutcome =
  'added' | 'admitted' | 'link_failed' | 'already_active' | 'kept_out'

/** What the store decides; the service adds whether an admitted applicant's
 * email went out. */
export type StoredOutcome = Exclude<WhitelistOutcome, 'link_failed'>

export interface WhitelistResult {
  email: string
  outcome: WhitelistOutcome
}

export interface StoredResult {
  email: string
  outcome: StoredOutcome
}

export interface WhitelistStore {
  /** Adds each address in one transaction, granting `role` to everyone it
   * makes active and recording who granted it. */
  add(
    emails: readonly string[],
    role: string,
    grantedBy: string,
  ): Promise<StoredResult[]>
}

export interface WhitelistService {
  add(emails: readonly string[], actorId: string): Promise<WhitelistResult[]>
}

/** Pre-approves addresses, the pre-summit path for invited attendees (F10).
 * A pending applicant on the list is admitted exactly as an approval would
 * admit them, sign-in email included (R-AUTH-3, R-AUTH-10); a failed email
 * leaves them admitted, since they can ask for a link at the login screen.
 * Everyone else is not emailed: they sign in when they arrive (F1). */
export function createWhitelist(deps: {
  store: WhitelistStore
  auth: Pick<AuthProvider, 'issueLink'>
  admittedRole: string
}): WhitelistService {
  const notify = async (result: StoredResult): Promise<WhitelistResult> => {
    if (result.outcome !== 'admitted') return result
    try {
      await deps.auth.issueLink(result.email, { kind: 'approval' })
      return result
    } catch {
      return { email: result.email, outcome: 'link_failed' }
    }
  }
  return {
    add: async (emails, actorId) => {
      const stored = await deps.store.add(
        [...new Set(emails)],
        deps.admittedRole,
        actorId,
      )
      const results: WhitelistResult[] = []
      for (const result of stored) results.push(await notify(result))
      return results
    },
  }
}
