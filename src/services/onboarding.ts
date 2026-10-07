import type { CompanySize, Sector } from '../profile-options.js'

/** The profile step as the member first sees it: their profile so far, with
 * what they gave at the door filling the gaps (F2, R-AUTH-12). */
export interface OnboardingDraft {
  name: string | null
  jobTitle: string | null
  org: string | null
  sector: string | null
  companySize: string | null
}

/** What the privacy step submits: the profile and the consent version read.
 * `jobTitle` is profile text, never an access role (R-ROLE-8). */
export interface OnboardingInput {
  name: string
  jobTitle?: string | undefined
  org?: string | undefined
  sector?: Sector | undefined
  companySize?: CompanySize | undefined
  consentVersion: string
}

export interface OnboardingStore {
  draft(memberId: string): Promise<OnboardingDraft | null>
  /** Records the profile and the consent version confirmed at `acceptedAt`,
   * and nothing else: the analytics opt-in is not onboarding's (ADR 0041). */
  save(
    memberId: string,
    input: OnboardingInput,
    acceptedAt: Date,
  ): Promise<void>
  /** The consent version the member confirmed and when, or null. */
  consent(
    memberId: string,
  ): Promise<{ version: string; acceptedAt: Date } | null>
  /** When the latest sign-in email to the member was recorded in the outbound
   * log, or null when none is kept (R-NFR-3). */
  signInEmailAt(memberId: string): Promise<Date | null>
}

/** A finished onboarding as `onboarding_completed` reports it: the consent
 * version and the seconds from the sign-in email, if one is kept (R-NFR-3). */
export interface OnboardingCompletion {
  consentVersion: string
  secondsToOnboard: number | null
}

export type OnboardingOutcome = 'done' | 'stale_consent'

const MS_PER_SECOND = 1000

export interface OnboardingService {
  draft(memberId: string): Promise<OnboardingDraft | null>
  complete(memberId: string, input: OnboardingInput): Promise<OnboardingOutcome>
  completion(memberId: string): Promise<OnboardingCompletion | null>
}

/** F2: records name, optional profile, and the consent version with its time
 * (R-ONB-2, R-ONB-3, R-ONB-8). Consent to any version but the one in force is
 * refused, so a member who read an older text reads the current one (R-ONB-4). */
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
    completion: async (memberId) => {
      const consent = await deps.store.consent(memberId)
      if (consent?.version !== deps.currentConsentVersion) return null
      const emailedAt = await deps.store.signInEmailAt(memberId)
      return {
        consentVersion: consent.version,
        secondsToOnboard:
          emailedAt === null
            ? null
            : Math.round(
                (consent.acceptedAt.getTime() - emailedAt.getTime()) /
                  MS_PER_SECOND,
              ),
      }
    },
  }
}
