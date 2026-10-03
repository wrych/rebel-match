import { afterEach, describe, expect, it, vi } from 'vitest'

function respond(status: number, body: unknown = {}): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function freshSession(): Promise<typeof import('./session')> {
  vi.resetModules()
  return import('./session')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('loadMe', () => {
  it('is nobody when the server says 401', async () => {
    respond(401)
    const { loadMe } = await freshSession()

    expect(await loadMe()).toBeNull()
  })

  it('asks the server once, however often it is called', async () => {
    const fetchMock = respond(200, { id: 'a', permissions: [] })
    const { loadMe } = await freshSession()

    await loadMe()
    await loadMe()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('asks again after forgetMe, once onboarding has changed the answer', async () => {
    const fetchMock = respond(200, { id: 'a', permissions: [] })
    const { forgetMe, loadMe } = await freshSession()

    await loadMe()
    forgetMe()
    await loadMe()

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('fails on anything else rather than pretend nobody is signed in', async () => {
    respond(500)
    const { loadMe } = await freshSession()

    await expect(loadMe()).rejects.toThrow(/500/)
  })

  it('asks again after a failure instead of keeping it', async () => {
    respond(500)
    const { loadMe } = await freshSession()
    await expect(loadMe()).rejects.toThrow()

    respond(200, { id: 'a', permissions: [] })

    expect(await loadMe()).toEqual({ id: 'a', permissions: [] })
  })
})

describe('signOut', () => {
  it('ends the session on the server and asks again next time', async () => {
    const fetchMock = respond(200, { id: 'a', permissions: [] })
    const { loadMe, signOut } = await freshSession()
    await loadMe()

    await signOut()
    await loadMe()

    expect(fetchMock).toHaveBeenCalledWith('/auth/logout', { method: 'POST' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('throws, and keeps the session, when the server did not end it', async () => {
    const fetchMock = respond(200, { id: 'a', permissions: [] })
    const { loadMe, signOut } = await freshSession()
    await loadMe()
    respond(500)

    await expect(signOut()).rejects.toThrow(/500/)
    vi.stubGlobal('fetch', fetchMock)
    await loadMe()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
