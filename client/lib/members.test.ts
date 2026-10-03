import { afterEach, describe, expect, it, vi } from 'vitest'
import { eraseMember, matchesSearch, type RosterMember } from './members'

const mia: RosterMember = {
  id: 'm-mia',
  email: 'mia@example.invalid',
  name: 'Mia Rebel',
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
