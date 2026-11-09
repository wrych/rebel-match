import { afterEach, describe, expect, it, vi } from 'vitest'
import { feedbackPath, screenFrom, sendFeedback } from './feedback'

afterEach(() => {
  vi.unstubAllGlobals()
})

function answer(status: number, body?: unknown): ReturnType<typeof vi.fn> {
  const fetch = vi.fn(() =>
    Promise.resolve(
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
      }),
    ),
  )
  vi.stubGlobal('fetch', fetch)
  return fetch
}

describe('feedbackPath', () => {
  it('names the screen it came from by route name (R-FB-1)', () => {
    expect(feedbackPath('matches')).toBe('/feedback?from=matches')
    expect(feedbackPath('not-found')).toBe('/feedback?from=not-found')
  })

  it('carries nothing that is not a screen', () => {
    expect(feedbackPath('/challenges/abc')).toBe('/feedback')
  })
})

describe('screenFrom', () => {
  it('reads back only a screen the app has', () => {
    expect(screenFrom('matches')).toBe('matches')
    expect(screenFrom('nowhere')).toBeUndefined()
    expect(screenFrom(['matches'])).toBeUndefined()
  })
})

describe('sendFeedback', () => {
  const draft = { message: 'Hi', name: '', email: '', screen: 'matches' }

  it('posts the draft with the solved check', async () => {
    const fetch = answer(204)

    expect(await sendFeedback(draft, 'payload')).toEqual({ state: 'sent' })
    const [path, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(path).toBe('/api/feedback')
    expect(JSON.parse(init.body as string)).toEqual({
      ...draft,
      altcha: 'payload',
    })
  })

  it('passes on a human check asked for, and a busy network (R-FB-2)', async () => {
    answer(200, { state: 'human-check', challenge: { signature: 's' } })
    expect(await sendFeedback(draft)).toEqual({
      state: 'human-check',
      challenge: { signature: 's' },
    })

    answer(429)
    expect(await sendFeedback(draft)).toEqual({ state: 'busy' })
  })

  it('throws when it was not sent', async () => {
    answer(503)
    await expect(sendFeedback(draft)).rejects.toThrow('feedback not sent (503)')
  })
})
