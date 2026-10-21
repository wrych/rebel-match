import { trackNothing, type Track } from './analytics.js'
import {
  DEFAULT_CADENCE,
  offeredCadences,
  type Cadence,
  type ChoosableType,
} from './notification-cadence.js'

/** One type on the profile screen: its cadence, its default and its options
 * (R-NOTE-2, R-NOTE-3). */
export interface NotificationSetting {
  type: ChoosableType
  cadence: Cadence
  defaultCadence: Cadence
  offered: readonly Cadence[]
}

export interface NotificationSettingsStore {
  /** The member's choices; a type with none is at its default. */
  chosen(memberId: string): Promise<Partial<Record<ChoosableType, Cadence>>>
  /** Records a choice, or with null goes back to the default. */
  choose(
    memberId: string,
    type: ChoosableType,
    cadence: Cadence | null,
  ): Promise<void>
  /** Hides the member's notifications of a type they have not seen yet. */
  hideUnseen(memberId: string, type: ChoosableType): Promise<void>
  /** Lets the worker decide afresh about the member's notifications of a
   * type still waiting, held for the cadence they had (R-NOTE-3). */
  releaseWaiting(memberId: string, type: ChoosableType): Promise<void>
}

export interface NotificationSettingsService {
  list(
    memberId: string,
    permissions: readonly string[],
  ): Promise<NotificationSetting[]>
  choose(
    memberId: string,
    permissions: readonly string[],
    type: string,
    cadence: string,
  ): Promise<'done' | 'not_found' | 'not_offered'>
}

/** What a member can receive, so may choose for: everyone can follow a
 * trend and earn badges; applicant and report notices go to who may review
 * them (R-NOTE-1, R-MOD-5). */
export function receivable(permissions: readonly string[]): ChoosableType[] {
  return [
    'connection_request',
    'new_connection',
    'trend_challenge',
    'badge',
    ...(permissions.includes('applicant:review')
      ? (['applicant'] as const)
      : []),
    ...(permissions.includes('report:review') ? (['report'] as const) : []),
  ]
}

/** Each member's choice of how each type of notification reaches them
 * (R-NOTE-2, R-NOTE-3). A choice applies to what is still waiting; setting a
 * type to Off hides what of it they have not seen; choosing the default
 * again forgets the choice. A change is reported to analytics (R-ANA-1). */
export function createNotificationSettings(
  store: NotificationSettingsStore,
  track: Track = trackNothing,
): NotificationSettingsService {
  return {
    list: async (memberId, permissions) => {
      const chosen = await store.chosen(memberId)
      return receivable(permissions).map((type) => ({
        type,
        cadence: chosen[type] ?? DEFAULT_CADENCE[type],
        defaultCadence: DEFAULT_CADENCE[type],
        offered: offeredCadences(type),
      }))
    },
    choose: async (memberId, permissions, type, cadence) => {
      const known = receivable(permissions).find((each) => each === type)
      if (known === undefined) return 'not_found'
      const offered = offeredCadences(known).find((each) => each === cadence)
      if (offered === undefined) return 'not_offered'
      const from =
        (await store.chosen(memberId))[known] ?? DEFAULT_CADENCE[known]
      await store.choose(
        memberId,
        known,
        offered === DEFAULT_CADENCE[known] ? null : offered,
      )
      if (offered === 'off') await store.hideUnseen(memberId, known)
      else await store.releaseWaiting(memberId, known)
      if (from !== offered)
        void track(memberId, {
          name: 'notification_cadence_changed',
          type: known,
          from,
          to: offered,
        })
      return 'done'
    },
  }
}
