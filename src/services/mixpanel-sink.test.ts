import { describe, expect, it, vi } from 'vitest'
import { AnalyticsSendError, createMixpanelSink } from './mixpanel-sink.js'

const at = new Date('2026-11-08T10:00:00Z')

function fakeFetch(
  status = 200,
  body: unknown = { status: 1 },
): ReturnType<typeof vi.fn> {
  return vi.fn(() =>
    Promise.resolve({
      ok: status < 300,
      status,
      json: () => Promise.resolve(body),
    }),
  )
}

function sent(fetchMock: ReturnType<typeof vi.fn>): {
  url: string
  body: { event: string; properties: Record<string, unknown> }[]
} {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  return { url, body: JSON.parse(init.body as string) as never }
}

describe('createMixpanelSink', () => {
  it('posts to the configured EU host without geolocating our server (ADR 0005)', async () => {
    const fetchMock = fakeFetch()
    const sink = createMixpanelSink({
      token: 'tok',
      apiHost: 'api-eu.mixpanel.com',
      fetch: fetchMock as unknown as typeof fetch,
    })

    await sink.send('a-1', { name: 'login_completed' }, at)

    expect(sent(fetchMock).url).toBe(
      'https://api-eu.mixpanel.com/track?ip=0&verbose=1',
    )
  })

  it('sends the event, its listed properties, and nothing that names anyone (R-ANA-3)', async () => {
    const fetchMock = fakeFetch()
    const sink = createMixpanelSink({
      token: 'tok',
      apiHost: 'api-eu.mixpanel.com',
      fetch: fetchMock as unknown as typeof fetch,
    })

    await sink.send(
      'a-1',
      { name: 'trend_assigned', trend_id: '03', overridden: true },
      at,
    )

    const [record] = sent(fetchMock).body
    expect(record?.event).toBe('trend_assigned')
    expect(Object.keys(record?.properties ?? {}).sort()).toEqual([
      '$insert_id',
      'distinct_id',
      'overridden',
      'time',
      'token',
      'trend_id',
    ])
    expect(record?.properties).toMatchObject({
      distinct_id: 'a-1',
      time: at.getTime(),
      trend_id: '03',
      overridden: true,
    })
  })

  it.each([
    [400, { status: 0, error: 'bad' }],
    [200, { status: 0 }],
  ])(
    'throws an error carrying only the event and status for HTTP %i',
    async (status, body) => {
      const sink = createMixpanelSink({
        token: 'tok',
        apiHost: 'api-eu.mixpanel.com',
        fetch: fakeFetch(status, body) as unknown as typeof fetch,
      })

      const failure = sink.send('a-secret', { name: 'login_completed' }, at)

      await expect(failure).rejects.toBeInstanceOf(AnalyticsSendError)
      await expect(failure).rejects.not.toThrow('a-secret')
    },
  )
})
