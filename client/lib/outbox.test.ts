import { afterEach, describe, expect, it, vi } from 'vitest'
import { bodyParts, fetchOutbox } from './outbox'

const origin = 'http://localhost:5173'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('bodyParts', () => {
  it('makes a link to this app clickable (F14)', () => {
    const link = `${origin}/auth/verify?token=t`

    expect(bodyParts(`Sign in:\n\n${link}\n\nBye`, origin)).toEqual([
      { text: 'Sign in:\n\n' },
      { href: link },
      { text: '\n\nBye' },
    ])
  })

  it('leaves a link elsewhere as plain text', () => {
    const body =
      'See https://evil.example/x and http://localhost:5173.evil.example/'

    expect(bodyParts(body, origin)).toEqual([{ text: body }])
  })

  it('renders a redacted body as text (R-MSG-4)', () => {
    expect(
      bodyParts('Sign in: [sign-in link removed from the log]', origin),
    ).toEqual([{ text: 'Sign in: [sign-in link removed from the log]' }])
  })
})

describe('fetchOutbox', () => {
  function stubFetch(ok = true): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 404,
      json: () => Promise.resolve({ entries: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('asks for everything when no filter is set', async () => {
    const fetchMock = stubFetch()

    await fetchOutbox({ to: ' ', status: '' })

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/outbox')
  })

  it('passes the recipient and status filters', async () => {
    const fetchMock = stubFetch()

    await fetchOutbox({ to: 'ada@example.invalid', status: 'failed' })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/outbox?to=ada%40example.invalid&status=failed',
    )
  })

  it('fails loudly when the server refuses', async () => {
    stubFetch(false)

    await expect(fetchOutbox({})).rejects.toThrow(/404/)
  })
})
