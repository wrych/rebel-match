import { describe, expect, it } from 'vitest'
import type { AnalyticsEvent } from './analytics.js'
import { createAnalyticsConsent, isOptedIn } from './analytics-consent.js'
import type { OnboardingCompletion } from './onboarding.js'

const at = new Date('2026-11-08T10:00:00Z')

function setup(completion: OnboardingCompletion | null = null): {
  consent: ReturnType<typeof createAnalyticsConsent>
  recorded: unknown[]
  tracked: [string, AnalyticsEvent][]
} {
  const recorded: unknown[] = []
  const tracked: [string, AnalyticsEvent][] = []
  const consent = createAnalyticsConsent({
    currentVersion: '2026-10-04',
    now: () => at,
    store: {
      record: (memberId, version, when) => {
        recorded.push({ memberId, version, when })
        return Promise.resolve()
      },
    },
    completion: () => Promise.resolve(completion),
    track: (memberId, event) => {
      tracked.push([memberId, event])
      return Promise.resolve()
    },
  })
  return { consent, recorded, tracked }
}

describe('isOptedIn', () => {
  it('needs a time and the words in force (R-ANA-4)', () => {
    const current = '2026-10-04'
    expect(
      isOptedIn(
        { analyticsConsentVersion: current, analyticsConsentAt: at },
        current,
      ),
    ).toBe(true)
    expect(
      isOptedIn(
        { analyticsConsentVersion: '2025-01-01', analyticsConsentAt: at },
        current,
      ),
    ).toBe(false)
    expect(
      isOptedIn(
        { analyticsConsentVersion: current, analyticsConsentAt: null },
        current,
      ),
    ).toBe(false)
    expect(
      isOptedIn(
        { analyticsConsentVersion: null, analyticsConsentAt: null },
        current,
      ),
    ).toBe(false)
  })
})

describe('createAnalyticsConsent', () => {
  it('records an opt-in to the current words with its time (R-ANA-4)', async () => {
    const { consent, recorded } = setup()

    expect(
      await consent.choose('m-ada', { optIn: true, version: '2026-10-04' }),
    ).toBe('done')
    expect(recorded).toEqual([
      { memberId: 'm-ada', version: '2026-10-04', when: at },
    ])
  })

  it('withdraws by clearing both, whatever the words', async () => {
    const { consent, recorded } = setup()

    expect(await consent.choose('m-ada', { optIn: false })).toBe('done')
    expect(recorded).toEqual([{ memberId: 'm-ada', version: null, when: null }])
  })

  it('refuses an opt-in to other words, recording nothing', async () => {
    const { consent, recorded } = setup()

    expect(
      await consent.choose('m-ada', { optIn: true, version: '2025-01-01' }),
    ).toBe('stale')
    expect(recorded).toEqual([])
  })
  it('reports the onboarding when the member shares on its usage step (R-ANA-6)', async () => {
    const { consent, tracked } = setup({
      consentVersion: '2026-11-01',
      secondsToOnboard: 84,
    })

    await consent.choose('m-ada', {
      optIn: true,
      version: '2026-10-04',
      from: 'onboarding',
    })

    expect(tracked).toEqual([
      [
        'm-ada',
        {
          name: 'onboarding_completed',
          consent_version: '2026-11-01',
          seconds_to_onboard: 84,
        },
      ],
    ])
  })

  it('leaves the time out of the report when it is not known (R-NFR-3)', async () => {
    const { consent, tracked } = setup({
      consentVersion: '2026-11-01',
      secondsToOnboard: null,
    })

    await consent.choose('m-ada', {
      optIn: true,
      version: '2026-10-04',
      from: 'onboarding',
    })

    expect(tracked).toEqual([
      [
        'm-ada',
        { name: 'onboarding_completed', consent_version: '2026-11-01' },
      ],
    ])
  })

  it('reports no onboarding for an opt-in from the profile screen (R-ANA-6)', async () => {
    const { consent, tracked } = setup({
      consentVersion: '2026-11-01',
      secondsToOnboard: 84,
    })

    await consent.choose('m-ada', { optIn: true, version: '2026-10-04' })

    expect(tracked).toEqual([])
  })

  it('reports nothing for stale words or a member not onboarded', async () => {
    const stale = setup({ consentVersion: '2026-11-01', secondsToOnboard: 1 })
    const notOnboarded = setup(null)

    await stale.consent.choose('m-ada', {
      optIn: true,
      version: '2025-01-01',
      from: 'onboarding',
    })
    await notOnboarded.consent.choose('m-ada', {
      optIn: true,
      version: '2026-10-04',
      from: 'onboarding',
    })

    expect(stale.tracked).toEqual([])
    expect(notOnboarded.tracked).toEqual([])
  })
})
