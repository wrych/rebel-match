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

export type AnalyticsChoice =
  { optIn: true; version: string } | { optIn: false }

export interface AnalyticsConsentStore {
  /** Records the opt-in to `version` at `at`, or clears it with nulls. */
  record(
    memberId: string,
    version: string | null,
    at: Date | null,
  ): Promise<void>
}

export interface AnalyticsConsentService {
  /** 'stale' when the member ticked words other than the ones in force. */
  choose(memberId: string, choice: AnalyticsChoice): Promise<'done' | 'stale'>
}

/** Gives or withdraws the analytics opt-in after onboarding, as easily as at
 * onboarding (R-ANA-4). */
export function createAnalyticsConsent(deps: {
  store: AnalyticsConsentStore
  currentVersion: string
  now?: () => Date
}): AnalyticsConsentService {
  const now = deps.now ?? ((): Date => new Date())
  return {
    choose: async (memberId, choice) => {
      if (!choice.optIn) {
        await deps.store.record(memberId, null, null)
        return 'done'
      }
      if (choice.version !== deps.currentVersion) return 'stale'
      await deps.store.record(memberId, choice.version, now())
      return 'done'
    },
  }
}
