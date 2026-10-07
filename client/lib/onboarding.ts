import { safeNextPath } from '../../src/routes'

/** The profile as the member types it on the first step (R-ONB-2). */
export interface TypedProfile {
  name: string
  jobTitle: string
  org: string
  sector: string
  companySize: string
}

/** The profile step pre-filled by `GET /api/onboarding`, with the consent
 * version in force (F2, R-AUTH-12). */
export interface OnboardingDraft {
  name: string | null
  jobTitle: string | null
  org: string | null
  sector: string | null
  companySize: string | null
  consentVersion: string
}

export type OnboardingAnswers = TypedProfile & { consentVersion: string }

export const onboardingSteps = {
  profile: '/onboarding',
  privacy: '/onboarding/privacy',
  usage: '/onboarding/usage',
} as const

const TYPED_KEY = 'rm_onboarding_profile'

let typed: TypedProfile | null = null

function asTyped(value: unknown): TypedProfile | null {
  if (value === null || typeof value !== 'object') return null
  const saved = value as Partial<Record<keyof TypedProfile, unknown>>
  if (typeof saved.name !== 'string' || saved.name.trim() === '') return null
  const text = (field: keyof TypedProfile): string => {
    const given = saved[field]
    return typeof given === 'string' ? given : ''
  }
  return {
    name: saved.name,
    jobTitle: text('jobTitle'),
    org: text('org'),
    sector: text('sector'),
    companySize: text('companySize'),
  }
}

/** Keeps what the member typed for this tab only, sending nothing, until the
 * privacy step stores it (R-ONB-7). Kept in memory too, so a browser that
 * refuses storage still reaches the next step. */
export function keepTyped(profile: TypedProfile): void {
  typed = { ...profile }
  try {
    sessionStorage.setItem(TYPED_KEY, JSON.stringify(typed))
  } catch {
    // Without storage the profile lives as long as this page does.
  }
}

/** What the member typed on the profile step in this tab, if anything. */
export function typedProfile(): TypedProfile | null {
  if (typed !== null) return { ...typed }
  try {
    return asTyped(JSON.parse(sessionStorage.getItem(TYPED_KEY) ?? 'null'))
  } catch {
    return null
  }
}

/** Drops the typed profile once the server has stored it (R-ONB-7). */
export function forgetTyped(): void {
  typed = null
  try {
    sessionStorage.removeItem(TYPED_KEY)
  } catch {
    // Nothing was kept there.
  }
}

export async function fetchDraft(): Promise<OnboardingDraft> {
  const response = await fetch('/api/onboarding')
  if (!response.ok)
    throw new Error(`onboarding unavailable (${String(response.status)})`)
  return (await response.json()) as OnboardingDraft
}

/** The privacy step's confirmation: the profile and the consent version read,
 * in one request (R-ONB-8); 'stale' when the words changed meanwhile. */
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

/** A step's path carrying `next` on, so the member still lands where they
 * came for (R-NAV-7). */
export function stepPath(step: string, next: string | null): string {
  return next === null ? step : `${step}?next=${encodeURIComponent(next)}`
}

const steps: ReadonlySet<string> = new Set(Object.values(onboardingSteps))

/** Where to go once onboarded: the deep link they came for, when it is a
 * screen of this app other than onboarding itself, else welcome (R-NAV-7). */
export function afterOnboarding(next: string | null): string {
  const safe = safeNextPath(next ?? undefined)
  const [path = ''] = safe.split(/[?#]/)
  return path === '/' || steps.has(path) ? '/welcome' : safe
}
