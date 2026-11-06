/** A live code as the owner's screen shows it, with who connected through
 * the owner's codes since the screen last asked (R-CODE-5, R-CODE-6). */
export interface IssuedCode {
  token: string
  showForSeconds: number
  usableUntil: string
  connected: { name: string }[]
}

/** How long a code is shown, and still usable after it is replaced. */
export interface LiveCodeTimes {
  seconds: number
  graceSeconds: number
}

export interface LiveCodeStore {
  /** In one transaction: cuts the owner's older unspent codes to now plus
   * the grace, stores the new hash usable for seconds plus grace, and hands
   * over, once, the names of those who connected through the owner's codes
   * (R-CODE-5, R-CODE-6). */
  issue(
    memberId: string,
    tokenHash: string,
    times: LiveCodeTimes,
  ): Promise<{ usableUntil: Date; connected: { name: string }[] }>
  /** Spends a usable code not the scanner's own, both members active and
   * onboarded, and connects the two directly, as R-CODE-6 says; the id of
   * the request to open, or null for a code that cannot be used. */
  redeem(
    scannerId: string,
    tokenHash: string,
    newId: string,
  ): Promise<string | null>
  /** Deletes codes expired unspent, spent and reported, or spent and never
   * reported for `keepMinutes`; how many. */
  purge(keepMinutes: number): Promise<number>
}

export type IssueOutcome =
  { result: 'issued'; code: IssuedCode } | { result: 'limit' }

export interface LiveCodeService {
  /** A new live code for the owner, unless they asked for too many this
   * minute (R-CODE-5). */
  issue(memberId: string): Promise<IssueOutcome>
  /** The request to open after scanning `token`, or null for any code that
   * cannot be used, the same for each (R-CODE-6, R-CODE-7). */
  redeem(scannerId: string, token: string): Promise<string | null>
  /** The tick's clean-up (ADR 0049). */
  purge(): Promise<number>
}

/** Live codes (R-CODE-5..7, ADR 0063): single-use tokens replaced every
 * few seconds, stored hashed, which connect at once; only the newest and,
 * for the grace, the one before can be used. */
export function createLiveCodes(deps: {
  store: LiveCodeStore
  times: () => LiveCodeTimes
  keepMinutes: () => number
  newToken: () => string
  hash: (token: string) => string
  newId: () => string
  /** Counts one issue for the member; false past the minute's limit. */
  mayIssue: (memberId: string) => boolean
}): LiveCodeService {
  return {
    issue: async (memberId) => {
      if (!deps.mayIssue(memberId)) return { result: 'limit' }
      const token = deps.newToken()
      const times = deps.times()
      const stored = await deps.store.issue(memberId, deps.hash(token), times)
      return {
        result: 'issued',
        code: {
          token,
          showForSeconds: times.seconds,
          usableUntil: stored.usableUntil.toISOString(),
          connected: stored.connected,
        },
      }
    },
    redeem: (scannerId, token) =>
      deps.store.redeem(scannerId, deps.hash(token), deps.newId()),
    purge: () => deps.store.purge(deps.keepMinutes()),
  }
}
