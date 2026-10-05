import { safeNextPath } from '../../src/routes'

/** The onboarding form as `GET /api/onboarding` pre-fills it (F2). */
export interface OnboardingDraft {
  name: string | null
  jobTitle: string | null
  org: string | null
  sector: string | null
  companySize: string | null
  consentVersion: string
  /** The analytics words in force, and whether the box starts ticked. */
  analyticsVersion: string
  analyticsOptIn: boolean
}

export interface OnboardingAnswers {
  name: string
  jobTitle: string
  org: string
  sector: string
  companySize: string
  consentVersion: string
  /** Sent only when the analytics box is ticked (R-ANA-4). */
  analyticsVersion?: string
}

export async function fetchDraft(): Promise<OnboardingDraft> {
  const response = await fetch('/api/onboarding')
  if (!response.ok)
    throw new Error(`onboarding unavailable (${String(response.status)})`)
  return (await response.json()) as OnboardingDraft
}

/** Submits the form; 'stale' when the consent or analytics words changed
 * while they read them, so they must read the new words (R-ONB-4). */
export async function completeOnboarding(
  answers: OnboardingAnswers,
): Promise<'done' | 'stale'> {
  const response = await fetch('/api/onboarding', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(answers),
  })
  if (response.status === 409) return 'stale'
  if (!response.ok)
    throw new Error(`onboarding failed (${String(response.status)})`)
  return 'done'
}

/** Where to go once onboarded: the deep link they came for, when it is a
 * screen of this app other than onboarding itself, else welcome (R-NAV-7). */
export function afterOnboarding(next: string | null): string {
  const safe = safeNextPath(next ?? undefined)
  const [path = ''] = safe.split(/[?#]/)
  return path === '/' || path === '/onboarding' ? '/welcome' : safe
}
