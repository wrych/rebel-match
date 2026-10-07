/** What happened in the app, recorded as part of running it (ADR 0033):
 * which challenges a member's swipe deck showed them (R-STAT-1), and which
 * invites were opened (R-STAT-6, ADR 0038). Nothing here reads a record back
 * (R-STAT-2). */
export interface ActivityStore {
  /** Records a view when the challenge is one the deck could show the member,
   * and says whether it did. */
  recordView(view: {
    id: string
    memberId: string
    challengeId: string
  }): Promise<boolean>
  /** Deletes the member's views and game day log, and nothing else
   * (R-STAT-4, R-GAME-16). */
  forgetHistory(memberId: string): Promise<void>
  /** Records an open of the invite the token names, if any does. */
  recordOpen(open: { id: string; token: string }): Promise<void>
}

export interface ActivityService {
  /** 'not_found' for the member's own challenge, an inactive or unknown one:
   * nothing is recorded. */
  viewed(
    memberId: string,
    challengeId: string,
  ): Promise<'recorded' | 'not_found'>
  /** Clears the member's activity history (R-STAT-4). */
  forgetHistory(memberId: string): Promise<void>
  /** Records that an invite link was opened, with nothing about who opened
   * it; an unknown token records nothing and says so to nobody. */
  inviteOpened(token: string): Promise<void>
}

export function createActivity(deps: {
  store: ActivityStore
  newId: () => string
}): ActivityService {
  return {
    viewed: async (memberId, challengeId) =>
      (await deps.store.recordView({ id: deps.newId(), memberId, challengeId }))
        ? 'recorded'
        : 'not_found',
    forgetHistory: (memberId) => deps.store.forgetHistory(memberId),
    inviteOpened: (token) => deps.store.recordOpen({ id: deps.newId(), token }),
  }
}
