export type ModerationReason = 'spam' | 'inappropriate' | 'other'

export const moderationReasons: readonly ModerationReason[] = [
  'spam',
  'inappropriate',
  'other',
]

/** One of a member's challenges as a host sees it on the member's page. A
 * withdrawn one keeps its place but not its text, which its author took back
 * from everyone (R-ASK-17, R-MOD-8). */
export interface ModeratedChallenge {
  id: string
  body: string | null
  trendShort: string | null
  state: 'shown' | 'withdrawn' | 'hidden'
  hiddenReason: ModerationReason | null
  createdAt: string
}

export interface ChallengeModerationStore {
  /** The member's challenges, newest first; null when there is no such
   * member. */
  ofMember(memberId: string): Promise<ModeratedChallenge[] | null>
  /** Hides a challenge not yet hidden, declines the requests still pending
   * about it, handles its reports and records the hiding, in one
   * transaction; false when there is none such. */
  hide(id: string, hiddenBy: string, reason: ModerationReason): Promise<boolean>
  /** Shows a hidden challenge again, recording who did; false when none
   * such is hidden. */
  unhide(id: string, actorId: string): Promise<boolean>
}

export interface ChallengeModeration {
  ofMember(memberId: string): Promise<ModeratedChallenge[] | null>
  hide(
    id: string,
    hiddenBy: string,
    reason: ModerationReason,
  ): Promise<'hidden' | 'not_found'>
  unhide(id: string, actorId: string): Promise<'shown' | 'not_found'>
}

/** A host hides a challenge from everyone but its author, or shows it again
 * (R-MOD-8, ADR 0055). Hiding never deletes, so it can be undone; showing it
 * again reopens no request it closed. */
export function createChallengeModeration(
  store: ChallengeModerationStore,
): ChallengeModeration {
  return {
    ofMember: (memberId) => store.ofMember(memberId),
    hide: async (id, hiddenBy, reason) =>
      (await store.hide(id, hiddenBy, reason)) ? 'hidden' : 'not_found',
    unhide: async (id, actorId) =>
      (await store.unhide(id, actorId)) ? 'shown' : 'not_found',
  }
}
