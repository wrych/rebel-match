import { describe, expect, it } from 'vitest'
import {
  createOnboarding,
  type OnboardingInput,
  type OnboardingStore,
} from './onboarding.js'

const at = new Date('2026-11-08T10:00:00Z')

function setup(): {
  onboarding: ReturnType<typeof createOnboarding>
  saved: { memberId: string; input: OnboardingInput; at: Date }[]
} {
  const saved: { memberId: string; input: OnboardingInput; at: Date }[] = []
  const store: OnboardingStore = {
    draft: () =>
      Promise.resolve({ name: 'Ada', jobTitle: null, org: null, sector: null }),
    save: (memberId, input, acceptedAt) => {
      saved.push({ memberId, input, at: acceptedAt })
      return Promise.resolve()
    },
  }
  const onboarding = createOnboarding({
    store,
    currentConsentVersion: '2026-11-01',
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

  it('passes the draft through', async () => {
    expect(await setup().onboarding.draft('m-ada')).toMatchObject({
      name: 'Ada',
    })
  })

  it('stamps the acceptance with the current time by default (R-ONB-3)', async () => {
    const stamped: Date[] = []
    const onboarding = createOnboarding({
      currentConsentVersion: '2026-11-01',
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
