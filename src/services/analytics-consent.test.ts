import { describe, expect, it } from 'vitest'
import { createAnalyticsConsent, isOptedIn } from './analytics-consent.js'

const at = new Date('2026-11-08T10:00:00Z')

function setup(): {
  consent: ReturnType<typeof createAnalyticsConsent>
  recorded: unknown[]
} {
  const recorded: unknown[] = []
  const consent = createAnalyticsConsent({
    currentVersion: '2026-10-04',
    now: () => at,
    store: {
      record: (memberId, version, when) => {
        recorded.push({ memberId, version, when })
        return Promise.resolve()
      },
    },
  })
  return { consent, recorded }
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
})
