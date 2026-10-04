import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  eraseMember,
  forEachMember,
  matchesSearch,
  type RosterMember,
} from './members'

const mia: RosterMember = {
  id: 'm-mia',
  email: 'mia@example.invalid',
  name: 'Mia Rebel',
  jobTitle: null,
  org: null,
  sector: null,
  status: 'active',
  roles: ['member'],
  joinedAt: '2026-10-01T09:00:00.000Z',
}

function reply(status: number, body?: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: status < 300,
        status,
        json: async () => body,
      }),
    ),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('eraseMember', () => {
  it.each([
    [204, undefined, 'erased'],
    [404, { result: 'not_found' }, 'gone'],
    [409, { result: 'created_invites' }, 'created-invites'],
    [409, { result: 'last_admin' }, 'last-admin'],
  ] as const)('maps %i %j to %s', async (status, body, outcome) => {
    reply(status, body)

    expect(await eraseMember('m-mia')).toBe(outcome)
  })

  it('throws on anything else, so a failure never reads as done', async () => {
    reply(500)

    await expect(eraseMember('m-mia')).rejects.toThrow('erasure failed')
  })
})

describe('matchesSearch', () => {
  it.each([
    ['', true],
    ['MIA@', true],
    ['rebel', true],
    ['ada', false],
  ])('%j matches: %s', (search, expected) => {
    expect(matchesSearch(mia, search)).toBe(expected)
  })
})

describe('forEachMember (R-MEM-3)', () => {
  it('runs for each member in turn, and a failure does not stop the rest', async () => {
    const ben = { ...mia, id: 'm-ben', name: 'Ben' }
    const order: string[] = []

    const outcomes = await forEachMember([mia, ben], (id) => {
      order.push(id)
      return id === 'm-mia'
        ? Promise.reject(new Error('network'))
        : Promise.resolve('done')
    })

    expect(order).toEqual(['m-mia', 'm-ben'])
    expect(outcomes.map((each) => each.outcome)).toEqual(['failed', 'done'])
  })
})
