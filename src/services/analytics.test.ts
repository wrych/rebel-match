import { describe, expect, it } from 'vitest'
import { createTracker, type AnalyticsEvent } from './analytics.js'

const at = new Date('2026-11-08T10:00:00Z')

function setup(opts: { optedIn?: boolean; sinkFails?: boolean } = {}): {
  track: ReturnType<typeof createTracker>
  sent: unknown[]
  errors: unknown[]
} {
  const sent: unknown[] = []
  const errors: unknown[] = []
  const track = createTracker({
    ids: {
      optedIn: (memberId) =>
        Promise.resolve(opts.optedIn === false ? null : `a-${memberId}`),
    },
    sink: {
      send: (distinctId, event, when) => {
        if (opts.sinkFails === true) return Promise.reject(new Error('down'))
        sent.push({ distinctId, event, when })
        return Promise.resolve()
      },
    },
    onError: (error) => errors.push(error),
    now: () => at,
  })
  return { track, sent, errors }
}

const event: AnalyticsEvent = { name: 'challenge_submitted', char_count: 42 }

describe('createTracker', () => {
  it('sends under the pseudonymous analytics id of an opted-in member (R-ANA-2)', async () => {
    const { track, sent } = setup()

    await track('m-ada', event)

    expect(sent).toEqual([{ distinctId: 'a-m-ada', event, when: at }])
  })

  it('sends nothing for a member who is not opted in (R-ANA-4)', async () => {
    const { track, sent } = setup({ optedIn: false })

    await track('m-ada', event)

    expect(sent).toEqual([])
  })

  it('hands a failed send to onError and never rejects (ADR 0026)', async () => {
    const { track, errors } = setup({ sinkFails: true })

    await expect(track('m-ada', event)).resolves.toBeUndefined()
    expect(errors).toHaveLength(1)
  })
})
