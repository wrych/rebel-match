import { afterEach, describe, expect, it, vi } from 'vitest'
import { signIn, tokenFromHash } from './sign-in'

function respond(status: number, body: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('tokenFromHash', () => {
  it('reads the token from the fragment (ADR 0027)', () => {
    expect(tokenFromHash('#token=abc-DEF_123')).toBe('abc-DEF_123')
  })

  it.each(['', '#', '#token=', '#other=1'])('finds none in %j', (hash) => {
    expect(tokenFromHash(hash)).toBeNull()
  })
})

describe('signIn', () => {
  it('posts the token and says where to go next (R-AUTH-5)', async () => {
    const fetchMock = respond(200, { next: '/matches' })

    expect(await signIn('t')).toEqual({ ok: true, next: '/matches' })
    expect(fetchMock).toHaveBeenCalledWith(
      '/auth/verify',
      expect.objectContaining({ method: 'POST', body: '{"token":"t"}' }),
    )
  })

  it('reports a dead link with its reason (R-AUTH-6)', async () => {
    respond(400, { reason: 'used' })

    expect(await signIn('t')).toEqual({ ok: false, reason: 'used' })
  })

  it('treats a reason it does not know as unknown', async () => {
    respond(400, { reason: 'weird' })

    expect(await signIn('t')).toEqual({ ok: false, reason: 'unknown' })
  })

  it('throws when the server fails, rather than calling the link dead', async () => {
    respond(503, {})

    await expect(signIn('t')).rejects.toThrow(/503/)
  })
})
