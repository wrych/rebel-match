import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  codesOpen,
  fetchProfileCode,
  issueLiveCode,
  liveCodeLink,
  openProfileCode,
  profileCodeLink,
  profileConnectPath,
  redeemLiveCode,
  resetProfileCode,
  setProfileCode,
  tokenOf,
} from './codes'

function answer(status: number, body: unknown = {}): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(() =>
    Promise.resolve({ ok: status < 300, status, json: async () => body }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('profile code addresses (R-CODE-2, R-CODE-3)', () => {
  it('reads the token from the fragment, or nothing', () => {
    expect(tokenOf('#t=abc-_1')).toBe('abc-_1')
    expect(tokenOf('#t=')).toBeNull()
    expect(tokenOf('')).toBeNull()
    expect(tokenOf('#x=1')).toBeNull()
  })

  it('keeps the token in the fragment of every address it makes', () => {
    expect(profileCodeLink('https://app.example', 'abc')).toBe(
      'https://app.example/p#t=abc',
    )
    expect(profileConnectPath('abc')).toBe('/p/connect#t=abc')
  })

  it('is open only while hosts have codes on (R-CODE-1)', () => {
    expect(codesOpen(1)).toBe(true)
    expect(codesOpen(0)).toBe(false)
  })
})

describe('the member’s own code (R-CODE-2, R-CODE-4)', () => {
  it('reads it, or null while codes are off', async () => {
    answer(200, { token: 't', enabled: true })
    expect(await fetchProfileCode()).toEqual({ token: 't', enabled: true })

    answer(404)
    expect(await fetchProfileCode()).toBeNull()
  })

  it('turns it off and resets it', async () => {
    const fetchMock = answer(200, { token: 't', enabled: false })
    await setProfileCode(false)
    await resetProfileCode()

    expect(fetchMock.mock.calls).toEqual([
      [
        '/api/me/profile-code',
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ enabled: false }),
        },
      ],
      ['/api/me/profile-code/reset', { method: 'POST' }],
    ])
  })
})

describe('openProfileCode (R-CODE-3, R-NFR-9)', () => {
  it('sends the token in the body, never the address', async () => {
    const fetchMock = answer(200, { memberId: 'b', card: {} })

    expect(await openProfileCode('secret')).toEqual({
      memberId: 'b',
      card: {},
    })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/profile-codes/open')
    expect(init.body).toBe(JSON.stringify({ token: 'secret' }))
  })

  it('is null for a code that cannot be used', async () => {
    answer(404)

    expect(await openProfileCode('old')).toBeNull()
  })
})

describe('live codes (R-CODE-5..7)', () => {
  it('reads a new code, the minute’s limit, and codes off', async () => {
    answer(201, { token: 't', showForSeconds: 30 })
    expect(await issueLiveCode()).toMatchObject({
      result: 'issued',
      code: { token: 't' },
    })
    answer(429)
    expect(await issueLiveCode()).toEqual({ result: 'limit' })
    answer(404)
    expect(await issueLiveCode()).toEqual({ result: 'off' })
  })

  it('reads a scan as connected, expired, or codes off', async () => {
    answer(200, { id: 'r1' })
    expect(await redeemLiveCode('t')).toEqual({ result: 'connected', id: 'r1' })
    answer(410)
    expect(await redeemLiveCode('t')).toEqual({ result: 'expired' })
    answer(404)
    expect(await redeemLiveCode('t')).toEqual({ result: 'off' })
  })

  it('links a live code by its fragment', () => {
    expect(liveCodeLink('https://app.example', 'abc')).toBe(
      'https://app.example/c#t=abc',
    )
  })
})
