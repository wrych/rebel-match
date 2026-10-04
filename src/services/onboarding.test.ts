import { describe, expect, it } from 'vitest'
import {
  createOnboarding,
  type OnboardingInput,
  type OnboardingStore,
} from './onboarding.js'

const at = new Date('2026-11-08T10:00:00Z')

function setup(draftAnalytics: string | null = null): {
  onboarding: ReturnType<typeof createOnboarding>
  saved: { memberId: string; input: OnboardingInput; at: Date }[]
} {
  const saved: { memberId: string; input: OnboardingInput; at: Date }[] = []
  const store: OnboardingStore = {
    draft: () =>
      Promise.resolve({
        name: 'Ada',
        jobTitle: null,
        org: null,
        sector: null,
        analyticsVersion: draftAnalytics,
      }),
    save: (memberId, input, acceptedAt) => {
      saved.push({ memberId, input, at: acceptedAt })
      return Promise.resolve()
    },
  }
  const onboarding = createOnboarding({
    store,
    currentConsentVersion: '2026-11-01',
    currentAnalyticsVersion: '2026-10-04',
    now: () => at,
  })
  return { onboarding, saved }
}

describe('createOnboarding', () => {
  it('records the profile with the consent version and time (R-ONB-3)', async () => {
    const { onboarding, saved } = setup()
    const input = {
      name: 'Ada',
      jobTitle: 'Coach',
      consentVersion: '2026-11-01',
    }

    expect(await onboarding.complete('m-ada', input)).toBe('done')
    expect(saved).toEqual([{ memberId: 'm-ada', input, at }])
  })

  it('refuses consent to any version but the current one (R-ONB-4)', async () => {
    const { onboarding, saved } = setup()

    expect(
      await onboarding.complete('m-ada', {
        name: 'Ada',
        consentVersion: '2026-01-01',
      }),
    ).toBe('stale_consent')
    expect(saved).toEqual([])
  })

  it('passes the draft through, the analytics box unticked by default', async () => {
    expect(await setup().onboarding.draft('m-ada')).toEqual({
      name: 'Ada',
      jobTitle: null,
      org: null,
      sector: null,
      analyticsOptIn: false,
    })
  })

  it('ticks the analytics box only for an opt-in to the words in force (R-ANA-4)', async () => {
    expect(
      (await setup('2026-10-04').onboarding.draft('m-ada'))?.analyticsOptIn,
    ).toBe(true)
    expect(
      (await setup('2025-01-01').onboarding.draft('m-ada'))?.analyticsOptIn,
    ).toBe(false)
  })

  it('records an analytics opt-in to the current words (R-ANA-4)', async () => {
    const { onboarding, saved } = setup()
    const input = {
      name: 'Ada',
      consentVersion: '2026-11-01',
      analyticsVersion: '2026-10-04',
    }

    expect(await onboarding.complete('m-ada', input)).toBe('done')
    expect(saved).toEqual([{ memberId: 'm-ada', input, at }])
  })

  it('refuses an opt-in to analytics words other than the current ones', async () => {
    const { onboarding, saved } = setup()

    expect(
      await onboarding.complete('m-ada', {
        name: 'Ada',
        consentVersion: '2026-11-01',
        analyticsVersion: '2025-01-01',
      }),
    ).toBe('stale_consent')
    expect(saved).toEqual([])
  })

  it('stamps the acceptance with the current time by default (R-ONB-3)', async () => {
    const stamped: Date[] = []
    const onboarding = createOnboarding({
      currentConsentVersion: '2026-11-01',
      currentAnalyticsVersion: '2026-10-04',
      store: {
        draft: () => Promise.resolve(null),
        save: (_m, _input, acceptedAt) => {
          stamped.push(acceptedAt)
          return Promise.resolve()
        },
      },
    })
    const before = Date.now()

    await onboarding.complete('m-ada', {
      name: 'Ada',
      consentVersion: '2026-11-01',
    })

    expect(stamped[0]?.getTime()).toBeGreaterThanOrEqual(before)
    expect(stamped[0]?.getTime()).toBeLessThanOrEqual(Date.now())
  })
})
