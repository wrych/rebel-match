import type { Track } from './analytics.js'
import type { OnboardingCompletion } from './onboarding.js'

/** A member is opted in to analytics only while both columns are set and the
 * words they ticked are the ones in force (R-ANA-4, ADR 0026). */
export function isOptedIn(
  row: {
    analyticsConsentVersion: string | null
    analyticsConsentAt: Date | null
  },
  currentVersion: string,
): boolean {
  return (
    row.analyticsConsentAt !== null &&
    row.analyticsConsentVersion === currentVersion
  )
}

/** An opt-in names the words read; one from the usage step of onboarding
 * says so with `from` (R-ANA-6). */
export type AnalyticsChoice =
  | { optIn: true; version: string; from?: 'onboarding' | undefined }
  | { optIn: false }

export interface AnalyticsConsentStore {
  /** Records the opt-in to `version` at `at`, or clears it with nulls. */
  record(
    memberId: string,
    version: string | null,
    at: Date | null,
  ): Promise<void>
  /** When the member last gave the opt-in, or null when it is not given. */
  givenAt(memberId: string): Promise<Date | null>
}

export interface AnalyticsConsentService {
  /** 'stale' when the member ticked words other than the ones in force. */
  choose(memberId: string, choice: AnalyticsChoice): Promise<'done' | 'stale'>
}

/** Gives or withdraws the analytics opt-in, on the usage step of onboarding
 * or the profile screen alike (R-ANA-4). Sharing on the usage step reports
 * the onboarding it ends; declining there reports nothing (R-ANA-6). */
export function createAnalyticsConsent(deps: {
  store: AnalyticsConsentStore
  currentVersion: string
  completion: (memberId: string) => Promise<OnboardingCompletion | null>
  track: Track
  now?: () => Date
}): AnalyticsConsentService {
  const now = deps.now ?? ((): Date => new Date())

  // Once per onboarding: not when the member already gave the opt-in after
  // confirming the words, so a repeated share reports nothing (R-ANA-6).
  async function reportOnboarding(
    memberId: string,
    givenBefore: Date | null,
  ): Promise<void> {
    const done = await deps.completion(memberId)
    if (done === null) return
    if (givenBefore !== null && givenBefore >= done.confirmedAt) return
    void deps.track(memberId, {
      name: 'onboarding_completed',
      consent_version: done.consentVersion,
      ...(done.secondsToOnboard === null
        ? {}
        : { seconds_to_onboard: done.secondsToOnboard }),
    })
  }

  return {
    choose: async (memberId, choice) => {
      if (!choice.optIn) {
        await deps.store.record(memberId, null, null)
        return 'done'
      }
      if (choice.version !== deps.currentVersion) return 'stale'
      const onboarding = choice.from === 'onboarding'
      const givenBefore = onboarding ? await deps.store.givenAt(memberId) : null
      await deps.store.record(memberId, choice.version, now())
      if (onboarding) await reportOnboarding(memberId, givenBefore)
      return 'done'
    },
  }
}
