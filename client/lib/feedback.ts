import { routeTable } from '../../src/routes'
import type { Challenge } from './human-check'
import { failure, send } from './request'

const SCREENS = new Set<string>([
  ...routeTable.map((route) => route.name),
  'not-found',
])

/** The feedback form, told which screen it was opened from by route name,
 * never its address, so no id rides along (R-FB-1). */
export function feedbackPath(screen: string): string {
  return SCREENS.has(screen)
    ? `/feedback?from=${encodeURIComponent(screen)}`
    : '/feedback'
}

/** The screen a feedback form was opened from, when it is one the app has. */
export function screenFrom(query: unknown): string | undefined {
  return typeof query === 'string' && SCREENS.has(query) ? query : undefined
}

/** What the form holds; a blank name or email is sent as none. */
export interface FeedbackDraft {
  message: string
  name: string
  email: string
  screen?: string | undefined
}

export type FeedbackReply =
  | { state: 'sent' }
  | { state: 'busy' }
  | { state: 'human-check'; challenge: Challenge }

/** Sends feedback to the team (R-FB-1): sent, too many for now, or a human
 * check to solve first (R-FB-2). Throws on anything else, so a failure is
 * never shown as sent. */
export async function sendFeedback(
  draft: FeedbackDraft,
  altcha?: string,
): Promise<FeedbackReply> {
  const response = await send('/api/feedback', 'POST', {
    message: draft.message,
    name: draft.name,
    email: draft.email,
    ...(draft.screen === undefined ? {} : { screen: draft.screen }),
    ...(altcha === undefined ? {} : { altcha }),
  })
  if (response.status === 204) return { state: 'sent' }
  if (response.status === 429) return { state: 'busy' }
  if (response.status === 200) {
    const body = (await response.json()) as { challenge: Challenge }
    return { state: 'human-check', challenge: body.challenge }
  }
  throw failure('feedback not sent', response)
}
