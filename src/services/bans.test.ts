import { describe, expect, it } from 'vitest'
import { configPolicy } from '../permissions.js'
import { createBans, type BanStore } from './bans.js'
import type { Holding } from './roles.js'

function setup(holdings: Holding[]): {
  bans: ReturnType<typeof createBans>
  calls: unknown[]
} {
  const calls: unknown[] = []
  const store: BanStore = {
    ban: (ban, roles, mayBan) => {
      calls.push([ban, roles])
      return Promise.resolve(mayBan(holdings) ? 'banned' : 'last_admin')
    },
    unban: (memberId) => Promise.resolve(memberId === 'm-rik'),
  }
  return { bans: createBans({ store, policy: configPolicy }), calls }
}

describe('createBans (R-MOD-9)', () => {
  it('bans with the reason, guarding those who can grant roles', async () => {
    const { bans, calls } = setup([{ memberId: 'm-host', role: 'admin' }])

    expect(await bans.ban('m-rik', 'm-host', 'Spam.')).toBe('banned')
    expect(calls).toEqual([
      [{ memberId: 'm-rik', actorId: 'm-host', note: 'Spam.' }, ['admin']],
    ])
  })

  it('refuses a host banning themselves, asking the store nothing', async () => {
    const { bans, calls } = setup([])

    expect(await bans.ban('m-host', 'm-host', 'Oops.')).toBe('self')
    expect(calls).toEqual([])
  })

  it('refuses banning the last who can grant roles (R-ROLE-9)', async () => {
    const { bans } = setup([{ memberId: 'm-rik', role: 'admin' }])

    expect(await bans.ban('m-rik', 'm-host', 'Spam.')).toBe('last_admin')
  })

  it('lifts a ban, not found when there is none', async () => {
    const { bans } = setup([])

    expect(await bans.unban('m-rik', 'm-host')).toBe('unbanned')
    expect(await bans.unban('m-ada', 'm-host')).toBe('not_found')
  })
})
