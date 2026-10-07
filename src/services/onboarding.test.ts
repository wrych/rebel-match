import { describe, expect, it } from 'vitest'
import {
  createOnboarding,
  type OnboardingInput,
  type OnboardingStore,
} from './onboarding.js'

const at = new Date('2026-11-08T10:00:00Z')
const draft = {
  name: 'Ada',
  jobTitle: null,
  org: null,
  sector: null,
  companySize: null,
}

function setup(
  options: {
    emailedAt?: Date | null
    consent?: { version: string; acceptedAt: Date; first: boolean } | null
  } = {},
): {
  onboarding: ReturnType<typeof createOnboarding>
  saved: { memberId: string; input: OnboardingInput; at: Date }[]
  asked: Date[]
} {
  const asked: Date[] = []
  const saved: { memberId: string; input: OnboardingInput; at: Date }[] = []
  const store: OnboardingStore = {
    draft: () => Promise.resolve(draft),
    save: (memberId, input, acceptedAt) => {
      saved.push({ memberId, input, at: acceptedAt })
      return Promise.resolve()
    },
    consent: () =>
      Promise.resolve(
        options.consent === undefined
          ? { version: '2026-11-01', acceptedAt: at, first: true }
          : options.consent,
      ),
    signInEmailAt: (_memberId, notAfter) => {
      asked.push(notAfter)
      return Promise.resolve(
        options.emailedAt === undefined
          ? new Date(at.getTime() - 90_000)
          : options.emailedAt,
      )
    },
  }
  const onboarding = createOnboarding({
    store,
    currentConsentVersion: '2026-11-01',
    now: () => at,
  })
  return { onboarding, saved, asked }
}

describe('createOnboarding', () => {
  it('records the profile with the consent version and time (R-ONB-3, R-ONB-8)', async () => {
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
    expect(await setup().onboarding.draft('m-ada')).toEqual(draft)
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
        consent: () => Promise.resolve(null),
        signInEmailAt: () => Promise.resolve(null),
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

describe('completion', () => {
  it('says how long it took from the sign-in email to the confirmation (R-NFR-3)', async () => {
    const { onboarding } = setup({ emailedAt: new Date(at.getTime() - 74_400) })

    expect(await onboarding.completion('m-ada')).toEqual({
      consentVersion: '2026-11-01',
      secondsToOnboard: 74,
    })
  })

  it('times from the sign-in email before the confirmation, not a later one (R-NFR-3)', async () => {
    const { onboarding, asked } = setup()

    await onboarding.completion('m-ada')

    expect(asked).toEqual([at])
  })

  it('leaves the time out when no sign-in email is kept', async () => {
    const { onboarding } = setup({ emailedAt: null })

    expect(await onboarding.completion('m-ada')).toEqual({
      consentVersion: '2026-11-01',
      secondsToOnboard: null,
    })
  })

  it('has none for a member confirming new words after onboarding once (R-ANA-6)', async () => {
    expect(
      await setup({
        consent: { version: '2026-11-01', acceptedAt: at, first: false },
      }).onboarding.completion('m-ada'),
    ).toBeNull()
  })

  it('has none for a member who has not confirmed the current words', async () => {
    expect(
      await setup({ consent: null }).onboarding.completion('m-ada'),
    ).toBeNull()
    expect(
      await setup({
        consent: { version: '2025-01-01', acceptedAt: at, first: true },
      }).onboarding.completion('m-ada'),
    ).toBeNull()
  })
})
