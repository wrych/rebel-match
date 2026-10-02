import { describe, expect, it } from 'vitest'
import { configPolicy } from '../permissions.js'
import {
  createRoleService,
  someoneStillHolds,
  type Holding,
  type RoleGrantStore,
} from './roles.js'

function memoryStore(
  active: string[],
  initial: Holding[],
): RoleGrantStore & { holdings: Holding[]; grantedBy: Map<string, string> } {
  const holdings = [...initial]
  const grantedBy = new Map<string, string>()
  const isHeld = (h: Holding): boolean =>
    holdings.some((x) => x.memberId === h.memberId && x.role === h.role)
  return {
    holdings,
    grantedBy,
    isActiveMember: (id) => Promise.resolve(active.includes(id)),
    grant: (memberId, role, by) => {
      if (!isHeld({ memberId, role })) holdings.push({ memberId, role })
      grantedBy.set(`${memberId}:${role}`, by)
      return Promise.resolve()
    },
    revoke: (memberId, role, guardedRoles, mayRevoke) => {
      const guarded = holdings.filter((h) => guardedRoles.includes(h.role))
      if (!mayRevoke(guarded)) return Promise.resolve('refused')
      const index = holdings.findIndex(
        (h) => h.memberId === memberId && h.role === role,
      )
      if (index === -1) return Promise.resolve('not_held')
      holdings.splice(index, 1)
      return Promise.resolve('revoked')
    },
  }
}

describe('someoneStillHolds', () => {
  const ana = { memberId: 'ana', role: 'admin' }

  it('is false when the removed holding was the only one', () => {
    expect(someoneStillHolds([ana], ana)).toBe(false)
  })

  it('is true when another member, or another role, still holds it', () => {
    expect(
      someoneStillHolds([ana, { memberId: 'ben', role: 'admin' }], ana),
    ).toBe(true)
    expect(
      someoneStillHolds([ana, { memberId: 'ana', role: 'lead' }], ana),
    ).toBe(true)
  })
})

describe('createRoleService', () => {
  it('grants a known role to an active member, recording who (R-ROLE-7)', async () => {
    const store = memoryStore(['ana', 'ben'], [])
    const roles = createRoleService({ store, policy: configPolicy })

    expect(await roles.grant('ana', 'ben', 'admin')).toBe('granted')
    expect(store.grantedBy.get('ben:admin')).toBe('ana')
  })

  it('refuses a role the policy does not know (R-ROLE-9)', async () => {
    const roles = createRoleService({
      store: memoryStore(['ana'], []),
      policy: configPolicy,
    })

    expect(await roles.grant('ana', 'ana', 'superuser')).toBe('unknown_role')
    expect(await roles.revoke('ana', 'superuser')).toBe('unknown_role')
  })

  it('grants nothing to a member who is not active', async () => {
    const roles = createRoleService({
      store: memoryStore(['ana'], []),
      policy: configPolicy,
    })

    expect(await roles.grant('ana', 'gone', 'member')).toBe('no_member')
  })

  it('refuses to revoke the last holder of role:grant (R-ROLE-9)', async () => {
    const store = memoryStore(['ana'], [{ memberId: 'ana', role: 'admin' }])
    const roles = createRoleService({ store, policy: configPolicy })

    expect(await roles.revoke('ana', 'admin')).toBe('last_holder')
    expect(store.holdings).toHaveLength(1)
  })

  it('revokes role:grant while another member still holds it', async () => {
    const store = memoryStore(
      ['ana', 'ben'],
      [
        { memberId: 'ana', role: 'admin' },
        { memberId: 'ben', role: 'admin' },
      ],
    )
    const roles = createRoleService({ store, policy: configPolicy })

    expect(await roles.revoke('ana', 'admin')).toBe('revoked')
  })

  it('revokes a role that guards nothing, and reports one not held', async () => {
    const store = memoryStore(['ana'], [{ memberId: 'ana', role: 'member' }])
    const roles = createRoleService({ store, policy: configPolicy })

    expect(await roles.revoke('ana', 'member')).toBe('revoked')
    expect(await roles.revoke('ana', 'member')).toBe('not_held')
  })
})
