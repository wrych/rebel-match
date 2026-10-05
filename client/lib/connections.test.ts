import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  answerRequest,
  byMember,
  contactPath,
  fetchContact,
  fetchRequest,
  kindOf,
  overInOrder,
  requestConnection,
  type ConnectionView,
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

    expect(await requestConnection(input)).toEqual({ result: 'created' })
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

    expect(await requestConnection(input)).toEqual({ result: expected })
  })

  it('reads 200 as joined, with the request to open (R-CONN-8)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ result: 'joined', id: 'r9' }),
      }),
    )

    expect(await requestConnection(input)).toEqual({
      result: 'joined',
      id: 'r9',
    })
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

  it('reads the contact of an accepted request (R-CONN-3)', async () => {
    const contact = { name: 'Sam', email: 's@x.invalid', mailto: 'mailto:s' }
    serve(200, { contact })

    expect(await fetchContact('r1')).toEqual(contact)
  })

  it('reads no contact before acceptance as null (R-CONN-6)', async () => {
    serve(404)

    expect(await fetchContact('r1')).toBeNull()
  })

  it.each([
    ['fetchRequest', (): Promise<unknown> => fetchRequest('r1')],
    ['answerRequest', (): Promise<unknown> => answerRequest('r1', 'accept')],
    ['fetchContact', (): Promise<unknown> => fetchContact('r1')],
  ])('%s throws on a server error', async (_name, call) => {
    serve(500)

    await expect(call()).rejects.toThrow('500')
  })
})

function accepted(
  id: string,
  memberId: string,
  unseen = false,
): ConnectionView {
  return {
    id,
    direction: 'outgoing',
    kind: 'same_boat',
    status: 'accepted',
    message: null,
    createdAt: '2026-11-08T10:00:00.000Z',
    other: {
      memberId,
      name: memberId,
      jobTitle: null,
      org: null,
      sector: null,
      companySize: null,
    },
    challenge: null,
    unseen,
  }
}

describe('byMember (R-MINE-5,6)', () => {
  it('lists each member once, opening their newest request', () => {
    const cards = byMember([
      accepted('r3', 'ivo'),
      accepted('r2', 'ana'),
      accepted('r1', 'ivo'),
    ])

    expect(cards.map((card) => [card.other.memberId, card.id])).toEqual([
      ['ivo', 'r3'],
      ['ana', 'r2'],
    ])
  })

  it('puts members with something unopened first, counted, opening the newest of it', () => {
    const cards = byMember([
      accepted('r4', 'ana'),
      accepted('r3', 'ivo'),
      accepted('r2', 'ivo', true),
      accepted('r1', 'ivo', true),
    ])

    expect(
      cards.map((card) => [card.other.memberId, card.id, card.unseen]),
    ).toEqual([
      ['ivo', 'r2', 2],
      ['ana', 'r4', 0],
    ])
  })

  it('lists nobody for no connections', () => {
    expect(byMember([])).toEqual([])
  })
})

describe('overInOrder (R-CONN-10)', () => {
  it('puts what is not opened yet first, the order otherwise kept', () => {
    const over = overInOrder([
      accepted('r3', 'ivo'),
      accepted('r2', 'ivo', true),
      accepted('r1', 'ivo'),
    ])

    expect(over.map((each) => each.id)).toEqual(['r2', 'r3', 'r1'])
  })
})

describe('contactPath', () => {
  it('encodes the request id', () => {
    expect(contactPath('r/1')).toBe('/matches/requests/r%2F1/contact')
  })
})
