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

/** An opt-in names the words read; an answer on the usage step of
 * onboarding says so with `from` (R-ANA-6). */
export type AnalyticsChoice =
  | { optIn: true; version: string; from?: 'onboarding' | undefined }
  | { optIn: false; from?: 'onboarding' | undefined }

export interface AnalyticsConsentStore {
  /** Records the opt-in to `version` at `at`, or clears it with nulls. */
  record(
    memberId: string,
    version: string | null,
    at: Date | null,
  ): Promise<void>
  /** Records the first answer on the usage step at `at`; false when the
   * member already answered there (R-ANA-6). */
  claimUsageAnswer(memberId: string, at: Date): Promise<boolean>
}

export interface AnalyticsConsentService {
  /** 'stale' when the member ticked words other than the ones in force. */
  choose(memberId: string, choice: AnalyticsChoice): Promise<'done' | 'stale'>
}

/** Gives or withdraws the analytics opt-in, on the usage step of onboarding
 * or the profile screen alike (R-ANA-4). The first answer on the usage step
 * is recorded; sharing as that answer reports the onboarding (R-ANA-6). */
export function createAnalyticsConsent(deps: {
  store: AnalyticsConsentStore
  currentVersion: string
  completion: (memberId: string) => Promise<OnboardingCompletion | null>
  track: Track
  now?: () => Date
}): AnalyticsConsentService {
  const now = deps.now ?? ((): Date => new Date())

  async function reportOnboarding(memberId: string): Promise<void> {
    if (!(await deps.store.claimUsageAnswer(memberId, now()))) return
    const done = await deps.completion(memberId)
    if (done === null) return
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
        if (choice.from === 'onboarding')
          await deps.store.claimUsageAnswer(memberId, now())
        return 'done'
      }
      if (choice.version !== deps.currentVersion) return 'stale'
      await deps.store.record(memberId, choice.version, now())
      if (choice.from === 'onboarding') await reportOnboarding(memberId)
      return 'done'
    },
  }
}
