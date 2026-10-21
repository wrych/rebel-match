import type {
  ModeratedChallenge,
  ModerationReason,
} from '../../src/services/challenge-moderation'
import { findJson, outcomeOf, send } from './request'

export type { ModeratedChallenge, ModerationReason }

const reasonWords: Record<ModerationReason, string> = {
  spam: 'as spam',
  inappropriate: 'as inappropriate',
  other: 'for another reason',
}

/** How a hiding's reason reads after "hid it" (R-MOD-8). */
export function hiddenAs(reason: ModerationReason): string {
  return reasonWords[reason]
}

/** The member's challenges as a host sees them (R-MOD-8, R-MEM-2); null when
 * there is no such member. */
export async function fetchMemberChallenges(
  memberId: string,
): Promise<ModeratedChallenge[] | null> {
  const found = await findJson<{ challenges: ModeratedChallenge[] }>(
    `/api/admin/members/${encodeURIComponent(memberId)}/challenges`,
    'challenges unavailable',
  )
  return found?.challenges ?? null
}

/** Hides a challenge from everyone but its author (R-MOD-8); `gone` when it
 * is already hidden or no longer there. */
export async function hideChallenge(
  id: string,
  reason: ModerationReason,
): Promise<'done' | 'gone'> {
  const response = await send(
    `/api/admin/challenges/${encodeURIComponent(id)}/hide`,
    'POST',
    { reason },
  )
  return outcomeOf<'done' | 'gone'>(response, 'challenge not hidden', {
    204: 'done',
    404: 'gone',
  })
}

/** Shows a hidden challenge again (R-MOD-8); `gone` when it is not hidden. */
export async function unhideChallenge(id: string): Promise<'done' | 'gone'> {
  const response = await send(
    `/api/admin/challenges/${encodeURIComponent(id)}/unhide`,
    'POST',
  )
  return outcomeOf<'done' | 'gone'>(response, 'challenge not shown', {
    204: 'done',
    404: 'gone',
  })
}
