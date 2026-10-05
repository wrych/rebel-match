/** What a member did in the app, recorded as part of running it (ADR 0033):
 * for now, which challenges their swipe deck showed them (R-STAT-1). Nothing
 * here reads a record back (R-STAT-2). */
export interface ActivityStore {
  /** Records a view when the challenge is one the deck could show the member,
   * and says whether it did. */
  recordView(view: {
    id: string
    memberId: string
    challengeId: string
  }): Promise<boolean>
  /** Deletes the member's views, and nothing else (R-STAT-4). */
  forgetViews(memberId: string): Promise<void>
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
    forgetHistory: (memberId) => deps.store.forgetViews(memberId),
  }
}
