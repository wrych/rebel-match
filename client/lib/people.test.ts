import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  chipsOf,
  fetchMemberCard,
  searchMembers,
  searchOpen,
  withOperator,
  withoutPart,
} from './people'

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

describe('searchOpen (R-FIND-1)', () => {
  it.each([
    [1, ['member:search'], true],
    [0, ['member:search'], false],
    [1, [], false],
  ])('is open while on (%i) to %j: %s', (on, permissions, open) => {
    expect(searchOpen(on, permissions)).toBe(open)
  })
})

describe('the query as chips (R-FIND-4)', () => {
  it('shows each operator, sectors by their label, and no plain word', () => {
    expect(
      chipsOf('ada org:"corporate rebels" sector:financial-services'),
    ).toEqual([
      { index: 1, label: 'Company: corporate rebels' },
      { index: 2, label: 'Sector: Financial services' },
    ])
  })

  it('removes the one part a chip stands for, the rest as typed', () => {
    expect(withoutPart('ada title:coach company:"x y"', 1)).toBe(
      'ada company:"x y"',
    )
  })

  it('adds an operator waiting for its value, or with one', () => {
    expect(withOperator('ada', 'company')).toBe('ada company:')
    expect(withOperator('', 'sector', 'retail')).toBe('sector:retail')
    expect(withOperator('ada', 'title', 'agile coach')).toBe(
      'ada title:"agile coach"',
    )
  })
})

describe('searchMembers (R-FIND-3)', () => {
  it('sends the query in the address, encoded', async () => {
    const fetchMock = answer(200, { results: [], more: false })

    expect(await searchMembers('company:"a&b"')).toEqual({
      results: [],
      more: false,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/members/search?q=company%3A%22a%26b%22',
    )
  })

  it('is null while hosts have search off (R-NAV-8)', async () => {
    answer(404)

    expect(await searchMembers('ada')).toBeNull()
  })
})

describe('fetchMemberCard (R-FIND-6)', () => {
  it('reads the card, or null for one not found', async () => {
    answer(200, { card: { memberId: 'b', name: 'Ben' } })
    expect(await fetchMemberCard('b')).toEqual({ memberId: 'b', name: 'Ben' })

    answer(404)
    expect(await fetchMemberCard('b')).toBeNull()
  })
})
