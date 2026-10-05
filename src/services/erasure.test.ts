import { describe, expect, it } from 'vitest'
import { configPolicy } from '../permissions.js'
import {
  createErasureService,
  leavesAHolder,
  type ErasureStore,
} from './erasure.js'
import type { Holding } from './roles.js'

describe('leavesAHolder', () => {
  it('allows erasing a member who holds no guarded role', () => {
    expect(leavesAHolder([{ memberId: 'a', role: 'admin' }], 'b')).toBe(true)
  })

  it('allows erasing one admin while another remains', () => {
    const holdings: Holding[] = [
      { memberId: 'a', role: 'admin' },
      { memberId: 'b', role: 'admin' },
    ]
    expect(leavesAHolder(holdings, 'a')).toBe(true)
  })

  it('refuses erasing the only admin (R-ROLE-9)', () => {
    expect(leavesAHolder([{ memberId: 'a', role: 'admin' }], 'a')).toBe(false)
  })
})

const NOW = new Date('2026-10-05T10:00:00Z')

/** A store that records what it is asked, answering `erased` and listing the
 * members `due` holds. */
function fakeStore(due: string[] = []): ErasureStore & {
  calls: unknown[]
} {
  const calls: unknown[] = []
  return {
    calls,
    erase: (memberId, guardedRoles, mayErase) => {
      calls.push({
        erase: memberId,
        guarded: guardedRoles,
        verdict: mayErase([{ memberId: 'a', role: 'admin' }]),
      })
      return Promise.resolve(memberId === 'kept' ? 'created_invites' : 'erased')
    },
    deactivate: (memberId, _guarded, _mayErase, plan) => {
      calls.push({ deactivate: memberId, ...plan })
      return Promise.resolve({
        result: 'scheduled',
        eraseAfter: plan.eraseAfter,
      })
    },
    restore: (memberId, ownOnly) => {
      calls.push({ restore: memberId, ownOnly })
      return Promise.resolve(true)
    },
    due: (now) => {
      calls.push({ due: now })
      return Promise.resolve(due)
    },
  }
}

function service(store: ErasureStore): ReturnType<typeof createErasureService> {
  return createErasureService({
    store,
    policy: configPolicy,
    graceDays: () => 30,
    now: () => NOW,
  })
}

describe('createErasureService', () => {
  it('checks the holders of role:grant, by permission (R-ROLE-3)', async () => {
    const store = fakeStore()

    await service(store).erase('a')

    expect(store.calls).toEqual([
      {
        erase: 'a',
        guarded: configPolicy.rolesGranting('role:grant'),
        verdict: false,
      },
    ])
  })

  it('deletes with the grace period, marking whose deletion it is (ADR 0032)', async () => {
    const store = fakeStore()

    const outcome = await service(store).delete('m-ada', true)

    const eraseAfter = new Date('2026-11-04T10:00:00Z')
    expect(outcome).toEqual({ result: 'scheduled', eraseAfter })
    expect(store.calls).toEqual([
      { deactivate: 'm-ada', eraseAfter, bySelf: true },
    ])
  })

  it('lets a host undo any deletion, and the member only their own', async () => {
    const store = fakeStore()
    const erasure = service(store)

    await erasure.restore('m-ada')
    await erasure.restoreOwn('m-ada')

    expect(store.calls).toEqual([
      { restore: 'm-ada', ownOnly: false },
      { restore: 'm-ada', ownOnly: true },
    ])
  })

  it('erases those due, and keeps going past one that cannot be erased', async () => {
    const store = fakeStore(['a', 'kept', 'b'])

    expect(await service(store).eraseDue()).toBe(2)
    expect(store.calls[0]).toEqual({ due: NOW })
  })
})
