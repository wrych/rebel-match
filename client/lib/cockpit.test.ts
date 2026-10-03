import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchCockpit, fetchIncoming } from './cockpit'

function answer(status: number, body: unknown = {}): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status < 300,
    status,
    json: () => Promise.resolve(body),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('cockpit reads', () => {
  it('reads the cockpit (R-MINE-1,3)', async () => {
    const cockpit = { challenges: [], following: [], pendingIncoming: 0 }
    const fetchMock = answer(200, cockpit)

    expect(await fetchCockpit()).toEqual(cockpit)
    expect(fetchMock).toHaveBeenCalledWith('/api/cockpit')
  })

  it('reads the requests waiting for the member (R-MINE-2)', async () => {
    const requests = [{ id: 'r1' }]
    const fetchMock = answer(200, { requests })

    expect(await fetchIncoming()).toEqual(requests)
    expect(fetchMock).toHaveBeenCalledWith('/api/connections/incoming')
  })

  it.each([
    ['fetchCockpit', fetchCockpit],
    ['fetchIncoming', fetchIncoming],
  ])('%s throws on a server error', async (_name, call) => {
    answer(500)

    await expect(call()).rejects.toThrow('500')
  })
})
