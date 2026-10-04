import { afterEach, describe, expect, it, vi } from 'vitest'
import { reportEvent } from './events'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('reportEvent', () => {
  it('posts to our own server, kept alive past a page change (ADR 0026)', () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    reportEvent({ event: 'journey_chosen', props: { journey: 'ask' } })

    expect(fetchMock).toHaveBeenCalledWith('/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        event: 'journey_chosen',
        props: { journey: 'ask' },
      }),
      keepalive: true,
    })
  })

  it('swallows a failure, which is never the member’s problem', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    )

    expect(() => {
      reportEvent({ event: 'feedback_opened', props: { screen: 'cockpit' } })
    }).not.toThrow()
    await Promise.resolve()
  })
})
