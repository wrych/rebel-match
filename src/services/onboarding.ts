import type { CompanySize, Sector } from '../profile-options.js'

/** The onboarding form as the member first sees it: their profile so far,
 * with what they gave at the door filling the gaps (F2, R-AUTH-12). */
export interface OnboardingDraft {
  name: string | null
  jobTitle: string | null
  org: string | null
  sector: string | null
  companySize: string | null
  /** The analytics words they last opted in to, if they did (R-ANA-4). */
  analyticsVersion: string | null
}

/** What the member submits. `jobTitle` is profile text, never an access role
 * (R-ROLE-8). */
export interface OnboardingInput {
  name: string
  jobTitle?: string | undefined
  org?: string | undefined
  sector?: Sector | undefined
  companySize?: CompanySize | undefined
  consentVersion: string
  /** Sent only when the analytics box is ticked: the words it was ticked
   * against (R-ANA-4, ADR 0026). */
  analyticsVersion?: string | undefined
}

export interface OnboardingStore {
  draft(memberId: string): Promise<OnboardingDraft | null>
  /** Records the profile, the consent version accepted and the analytics
   * opt-in or its absence, at `acceptedAt`. */
  save(
    memberId: string,
    input: OnboardingInput,
    acceptedAt: Date,
  ): Promise<void>
}

export type OnboardingOutcome = 'done' | 'stale_consent'

/** The form's pre-fill, with whether the analytics box starts ticked: only
 * when the member already opted in to the words in force. */
export type OnboardingForm = Omit<OnboardingDraft, 'analyticsVersion'> & {
  analyticsOptIn: boolean
}

export interface OnboardingService {
  draft(memberId: string): Promise<OnboardingForm | null>
  complete(memberId: string, input: OnboardingInput): Promise<OnboardingOutcome>
}

/** F2: records name, optional profile, and the consent version with its time
 * (R-ONB-2, R-ONB-3). Consent to any version but the one in force is refused,
 * so a member who read an older text accepts the current one (R-ONB-4). */
export function createOnboarding(deps: {
  store: OnboardingStore
  currentConsentVersion: string
  currentAnalyticsVersion: string
  now?: () => Date
}): OnboardingService {
  const now = deps.now ?? ((): Date => new Date())
  return {
    draft: async (memberId) => {
      const draft = await deps.store.draft(memberId)
      if (draft === null) return null
      const { analyticsVersion, ...fields } = draft
      return {
        ...fields,
        analyticsOptIn: analyticsVersion === deps.currentAnalyticsVersion,
      }
    },
    complete: async (memberId, input) => {
      if (input.consentVersion !== deps.currentConsentVersion)
        return 'stale_consent'
      if (
        input.analyticsVersion !== undefined &&
        input.analyticsVersion !== deps.currentAnalyticsVersion
      )
        return 'stale_consent'
      await deps.store.save(memberId, input, now())
      return 'done'
    },
  }
}
