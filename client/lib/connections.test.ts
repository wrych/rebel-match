import { afterEach, describe, expect, it, vi } from 'vitest'
import { kindOf, requestConnection } from './connections'

const input = {
  targetId: 'm2',
  challengeId: 'c1',
  kind: 'same_boat' as const,
  message: 'Shall we compare notes?',
}

function answer(status: number): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({ ok: status < 300, status })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('requestConnection', () => {
  it('posts the request and reads 201 as created (R-CONN-1)', async () => {
    const fetchMock = answer(201)

    expect(await requestConnection(input)).toBe('created')
    expect(fetchMock).toHaveBeenCalledWith('/api/connections', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
  })

  it.each([
    [409, 'exists'],
    [404, 'not_found'],
  ])('reads %i as %s (R-CONN-5, R-NAV-8)', async (status, expected) => {
    answer(status)

    expect(await requestConnection(input)).toBe(expected)
  })

  it('throws on anything else', async () => {
    answer(500)

    await expect(requestConnection(input)).rejects.toThrow('500')
  })
})

describe('kindOf', () => {
  it.each([
    ['same_boat', 'same_boat'],
    ['been_there', 'been_there'],
    ['follow', null],
    [undefined, null],
    [['same_boat'], null],
  ])('reads %j as %j', (value, expected) => {
    expect(kindOf(value)).toBe(expected)
  })
})
