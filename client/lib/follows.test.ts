import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchFollowed, setFollowing } from './follows'

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

describe('follows', () => {
  it('reads the followed trends (R-MINE-3)', async () => {
    const trends = [{ id: '01', short: 'Purpose', from: 'Profit', peers: 1 }]
    answer(200, { trends })

    expect(await fetchFollowed()).toEqual(trends)
  })

  it('throws when the followed trends cannot be read', async () => {
    answer(500)

    await expect(fetchFollowed()).rejects.toThrow('500')
  })

  it('follows with POST and unfollows with DELETE (R-ASK-9)', async () => {
    const fetchMock = answer(204)

    await setFollowing('03', true)
    await setFollowing('03', false)

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/follows/03', {
      method: 'POST',
    })
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/follows/03', {
      method: 'DELETE',
    })
  })

  it('throws when the follow is not saved', async () => {
    answer(404)

    await expect(setFollowing('99', true)).rejects.toThrow('404')
  })
})
