/** The onboarding form as the member first sees it: their profile so far,
 * with what they gave at the door filling the gaps (F2, R-AUTH-12). */
export interface OnboardingDraft {
  name: string | null
  jobTitle: string | null
  org: string | null
  sector: string | null
}

/** What the member submits. `jobTitle` is profile text, never an access role
 * (R-ROLE-8). */
export interface OnboardingInput {
  name: string
  jobTitle?: string | undefined
  org?: string | undefined
  sector?: string | undefined
  consentVersion: string
}

export interface OnboardingStore {
  draft(memberId: string): Promise<OnboardingDraft | null>
  /** Records the profile and the consent version accepted, at `acceptedAt`. */
  save(
    memberId: string,
    input: OnboardingInput,
    acceptedAt: Date,
  ): Promise<void>
}

export type OnboardingOutcome = 'done' | 'stale_consent'

export interface OnboardingService {
  draft(memberId: string): Promise<OnboardingDraft | null>
  complete(memberId: string, input: OnboardingInput): Promise<OnboardingOutcome>
}

/** F2: records name, optional profile, and the consent version with its time
 * (R-ONB-2, R-ONB-3). Consent to any version but the one in force is refused,
 * so a member who read an older text accepts the current one (R-ONB-4). */
export function createOnboarding(deps: {
  store: OnboardingStore
  currentConsentVersion: string
  now?: () => Date
}): OnboardingService {
  const now = deps.now ?? ((): Date => new Date())
  return {
    draft: (memberId) => deps.store.draft(memberId),
    complete: async (memberId, input) => {
      if (input.consentVersion !== deps.currentConsentVersion)
        return 'stale_consent'
      await deps.store.save(memberId, input, now())
      return 'done'
    },
  }
}
