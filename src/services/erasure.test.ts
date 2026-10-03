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

describe('createErasureService', () => {
  it('checks the holders of role:grant, by permission (R-ROLE-3)', async () => {
    const seen: { guarded: readonly string[]; verdict: boolean }[] = []
    const store: ErasureStore = {
      erase: (_memberId, guardedRoles, mayErase) => {
        seen.push({
          guarded: guardedRoles,
          verdict: mayErase([{ memberId: 'a', role: 'admin' }]),
        })
        return Promise.resolve('last_admin')
      },
    }
    const erasure = createErasureService({ store, policy: configPolicy })

    expect(await erasure.erase('a')).toBe('last_admin')
    expect(seen).toEqual([
      { guarded: configPolicy.rolesGranting('role:grant'), verdict: false },
    ])
  })
})
