import { describe, expect, it } from 'vitest'
import {
  createLiveCodes,
  type LiveCodeService,
  type LiveCodeStore,
} from './live-codes.js'

function setup(allowed = true): {
  service: LiveCodeService
  calls: unknown[]
} {
  const calls: unknown[] = []
  const store: LiveCodeStore = {
    issue: (memberId, tokenHash, times) => {
      calls.push(['issue', memberId, tokenHash, times])
      return Promise.resolve({
        usableUntil: new Date('2026-11-08T10:00:40Z'),
        connected: [{ name: 'Ben' }],
      })
    },
    redeem: (scannerId, tokenHash, newId) => {
      calls.push(['redeem', scannerId, tokenHash, newId])
      return Promise.resolve(tokenHash === 'hash:good' ? 'r-1' : null)
    },
    purge: (keepMinutes) => {
      calls.push(['purge', keepMinutes])
      return Promise.resolve(2)
    },
  }
  const service = createLiveCodes({
    store,
    times: () => ({ seconds: 30, graceSeconds: 10 }),
    keepMinutes: () => 60,
    newToken: () => 'good',
    hash: (token) => `hash:${token}`,
    newId: () => 'r-new',
    mayIssue: () => allowed,
  })
  return { service, calls }
}

describe('live codes (R-CODE-5, R-CODE-6)', () => {
  it('issues a code, storing only its hash, with who just connected', async () => {
    const { service, calls } = setup()

    expect(await service.issue('m-ada')).toEqual({
      result: 'issued',
      code: {
        token: 'good',
        showForSeconds: 30,
        usableUntil: '2026-11-08T10:00:40.000Z',
        connected: [{ name: 'Ben' }],
      },
    })
    expect(calls).toEqual([
      ['issue', 'm-ada', 'hash:good', { seconds: 30, graceSeconds: 10 }],
    ])
  })

  it('issues none past the minute’s limit, storing nothing', async () => {
    const { service, calls } = setup(false)

    expect(await service.issue('m-ada')).toEqual({ result: 'limit' })
    expect(calls).toEqual([])
  })

  it('redeems by the token’s hash, and null for one that cannot be used', async () => {
    const { service } = setup()

    expect(await service.redeem('m-bob', 'good')).toBe('r-1')
    expect(await service.redeem('m-bob', 'bad')).toBeNull()
  })

  it('cleans up with the configured keep (R-CODE-6)', async () => {
    const { service, calls } = setup()

    expect(await service.purge()).toBe(2)
    expect(calls).toEqual([['purge', 60]])
  })
})
