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
  list(memberId: string, canReview: boolean): Promise<NotificationSetting[]>
  choose(
    memberId: string,
    canReview: boolean,
    type: string,
    cadence: string,
  ): Promise<'done' | 'not_found' | 'not_offered'>
}

/** What a member can receive, so may choose for: everyone can follow a
 * trend; applicant notices go to who may review them (R-NOTE-1). */
export function receivable(canReview: boolean): ChoosableType[] {
  return [
    'connection_request',
    'new_connection',
    'trend_challenge',
    ...(canReview ? (['applicant'] as const) : []),
  ]
}

/** Each member's choice of how each type of notification reaches them
 * (R-NOTE-2, R-NOTE-3). A choice applies to what is still waiting; setting a
 * type to Off hides what of it they have not seen; choosing the default
 * again forgets the choice. */
export function createNotificationSettings(
  store: NotificationSettingsStore,
): NotificationSettingsService {
  return {
    list: async (memberId, canReview) => {
      const chosen = await store.chosen(memberId)
      return receivable(canReview).map((type) => ({
        type,
        cadence: chosen[type] ?? DEFAULT_CADENCE[type],
        defaultCadence: DEFAULT_CADENCE[type],
        offered: offeredCadences(type),
      }))
    },
    choose: async (memberId, canReview, type, cadence) => {
      const known = receivable(canReview).find((each) => each === type)
      if (known === undefined) return 'not_found'
      const offered = offeredCadences(known).find((each) => each === cadence)
      if (offered === undefined) return 'not_offered'
      await store.choose(
        memberId,
        known,
        offered === DEFAULT_CADENCE[known] ? null : offered,
      )
      if (offered === 'off') await store.hideUnseen(memberId, known)
      else await store.releaseWaiting(memberId, known)
      return 'done'
    },
  }
}
