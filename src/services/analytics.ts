import type { BadgeRow, eventRow } from '../badges/rows.js'
import type { ModerationReason } from './challenge-moderation.js'
import type { Cadence, ChoosableType } from './notification-cadence.js'
import type { NotificationKind } from './notifications.js'

/** The events of design §7, each with only its listed, non-identifying
 * properties (R-ANA-1, R-ANA-3). The types are the allowlist: there is no
 * field for a name, an email address or a challenge's words. */
export type AnalyticsEvent =
  | { name: 'login_completed' }
  | {
      name: 'onboarding_completed'
      consent_version: string
      seconds_to_onboard?: number
    }
  | { name: 'journey_chosen'; journey: 'ask' | 'offer' }
  | { name: 'challenge_submitted'; char_count: number }
  | { name: 'trend_assigned'; trend_id: string; overridden: boolean }
  | {
      name: 'swipe'
      action: 'same_boat' | 'been_there' | 'follow' | 'skip'
      trend_id: string
    }
  | { name: 'connection_requested'; kind: 'same_boat' | 'been_there' }
  | {
      name: 'connection_responded'
      status: 'accepted' | 'declined'
      hours_to_respond: number
    }
  | { name: 'contact_opened'; unseen: boolean }
  | { name: 'contact_reached_out'; method: 'email' | 'copy' }
  | {
      name: 'notification_opened'
      type: NotificationKind
      via: 'app' | 'email'
    }
  | { name: 'notifications_list_opened'; new_count: number }
  | {
      name: 'notification_cadence_changed'
      type: ChoosableType
      from: Cadence
      to: Cadence
    }
  | { name: 'deck_emptied' }
  | { name: 'trend_follow_changed'; trend_id: string; followed: boolean }
  | { name: 'trend_opened'; trend_id: string }
  | { name: 'feedback_opened'; screen: string }
  | { name: 'game_opened' }
  | {
      name: 'game_day_finished'
      mode: 'boss' | 'rebel'
      level: number
      outcome: 'won' | 'lost' | 'abandoned'
      seconds: number
    }
  | { name: 'game_result_shared' }
  | { name: 'badge_earned'; row: BadgeRow; level: number }
  | { name: 'badge_earned'; row: typeof eventRow }
  | { name: 'experiment_exposed'; experiment: string; variant: string }
  | {
      name: 'matches_section_opened'
      section: 'same_boat' | 'been_there' | 'cases'
    }
  | { name: 'match_connect_tapped'; kind: 'same_boat' | 'been_there' }
  | {
      name: 'content_reported'
      kind: 'challenge' | 'note'
      reason: ModerationReason
    }

/** Reports what a member did. It never rejects and is not awaited by the
 * request it describes, so analytics can neither fail nor slow it. */
export type Track = (memberId: string, event: AnalyticsEvent) => Promise<void>

export const trackNothing: Track = () => Promise.resolve()

export interface AnalyticsIds {
  /** The member's pseudonymous `analytics_id` while they are opted in to the
   * words in force, else null (R-ANA-2, R-ANA-4). */
  optedIn(memberId: string): Promise<string | null>
}

export interface AnalyticsSink {
  send(distinctId: string, event: AnalyticsEvent, at: Date): Promise<void>
}

/** Sends an event only for a member opted in at that moment, under their
 * analytics id (ADR 0026). A failure goes to `onError`, which must not log
 * personal data, and is otherwise dropped. */
export function createTracker(deps: {
  ids: AnalyticsIds
  sink: AnalyticsSink
  onError: (error: unknown) => void
  now?: () => Date
}): Track {
  const now = deps.now ?? ((): Date => new Date())
  return async (memberId, event) => {
    try {
      const distinctId = await deps.ids.optedIn(memberId)
      if (distinctId !== null) await deps.sink.send(distinctId, event, now())
    } catch (error) {
      deps.onError(error)
    }
  }
}
