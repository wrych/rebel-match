import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  deleteMember,
  eraseNow,
  restoreMember,
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
  companySize: null,
  status: 'active',
  roles: ['member'],
  joinedAt: '2026-10-01T09:00:00.000Z',
  eraseAfter: null,
  deletedBySelf: null,
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

describe('deleteMember (ADR 0032)', () => {
  it('reports the day it will be erased', async () => {
    reply(200, { eraseAfter: '2026-11-04T10:00:00.000Z' })

    expect(await deleteMember('m-mia')).toEqual({
      result: 'deleted',
      eraseAfter: '2026-11-04T10:00:00.000Z',
    })
  })

  it.each([
    [404, { result: 'not_found' }, 'gone'],
    [409, { result: 'created_invites' }, 'created-invites'],
    [409, { result: 'last_admin' }, 'last-admin'],
  ] as const)('maps %i %j to %s', async (status, body, result) => {
    reply(status, body)

    expect(await deleteMember('m-mia')).toEqual({ result })
  })

  it('throws on anything else, so a failure never reads as done', async () => {
    reply(500)

    await expect(deleteMember('m-mia')).rejects.toThrow('deleting failed')
  })
})

describe('eraseNow', () => {
  it.each([
    [204, undefined, 'erased'],
    [404, { result: 'not_found' }, 'gone'],
    [409, { result: 'last_admin' }, 'last-admin'],
  ] as const)('maps %i %j to %s', async (status, body, outcome) => {
    reply(status, body)

    expect(await eraseNow('m-mia')).toBe(outcome)
  })
})

describe('restoreMember', () => {
  it.each([
    [204, 'restored'],
    [404, 'gone'],
  ] as const)('maps %i to %s', async (status, outcome) => {
    reply(status)

    expect(await restoreMember('m-mia')).toBe(outcome)
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
