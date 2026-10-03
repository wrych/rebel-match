import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  answerRequest,
  fetchRequest,
  kindOf,
  requestConnection,
} from './connections'

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

describe('request reads and answers', () => {
  function serve(status: number, body: unknown = {}): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: status < 300,
      status,
      json: () => Promise.resolve(body),
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('reads a request the member is a party to', async () => {
    const request = { id: 'r1' }
    const fetchMock = serve(200, { request })

    expect(await fetchRequest('r1')).toEqual(request)
    expect(fetchMock).toHaveBeenCalledWith('/api/connections/r1')
  })

  it('reads any other request as null (R-NAV-8)', async () => {
    serve(404)

    expect(await fetchRequest('r2')).toBeNull()
  })

  it.each([
    ['accept', 'accept'],
    ['decline', 'decline'],
  ] as const)('posts %s (R-CONN-3,4)', async (verdict, path) => {
    const fetchMock = serve(204)

    expect(await answerRequest('r1', verdict)).toBe('done')
    expect(fetchMock).toHaveBeenCalledWith(`/api/connections/r1/${path}`, {
      method: 'POST',
    })
  })

  it('reads an answer to a request no longer waiting as gone', async () => {
    serve(404)

    expect(await answerRequest('r1', 'accept')).toBe('gone')
  })

  it.each([
    ['fetchRequest', (): Promise<unknown> => fetchRequest('r1')],
    ['answerRequest', (): Promise<unknown> => answerRequest('r1', 'accept')],
  ])('%s throws on a server error', async (_name, call) => {
    serve(500)

    await expect(call()).rejects.toThrow('500')
  })
})
