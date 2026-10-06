import { describe, expect, it } from 'vitest'
import {
  createInvites,
  inviteState,
  joinUrl,
  type Invite,
  type InviteStore,
  type ListedInvite,
} from './invites.js'

const now = new Date('2026-11-08T10:00:00Z')
const hour = 3_600_000

function invite(overrides: Partial<Invite> = {}): Invite {
  return {
    id: 'i-1',
    token: 'tok',
    label: 'Main stage',
    validFrom: new Date(now.getTime() - hour),
    validUntil: new Date(now.getTime() + hour),
    maxUses: 10,
    uses: 0,
    revokedAt: null,
    createdBy: 'm-host',
    createdAt: new Date(now.getTime() - 2 * hour),
    ...overrides,
  }
}

describe('inviteState', () => {
  it.each([
    ['active', {}],
    ['scheduled', { validFrom: new Date(now.getTime() + 1) }],
    ['expired', { validUntil: now }],
    ['exhausted', { uses: 10 }],
    ['revoked', { revokedAt: now }],
    ['revoked', { revokedAt: now, uses: 10, validUntil: now }],
    ['exhausted', { uses: 10, validUntil: now }],
  ] as const)('reads %s (R-INV-2,3,4,9)', (state, overrides) => {
    expect(inviteState(invite(overrides), now)).toBe(state)
  })
})

describe('joinUrl', () => {
  it('opens the app root with the token, for the QR (R-NAV-10)', () => {
    expect(joinUrl('https://match.example.org', 'abc')).toBe(
      'https://match.example.org/?invite=abc',
    )
  })
})

function setup(): {
  invites: ReturnType<typeof createInvites>
  rows: Map<string, ListedInvite>
} {
  const rows = new Map<string, ListedInvite>()
  const store: InviteStore = {
    list: () => Promise.resolve([...rows.values()]),
    find: (id) => Promise.resolve(rows.get(id) ?? null),
    insert: (row) => {
      rows.set(row.id, {
        ...row,
        uses: 0,
        opens: 0,
        revokedAt: null,
        createdAt: now,
        creatorEmail: 'host@example.invalid',
      })
      return Promise.resolve()
    },
    revoke: (id, at) => {
      const row = rows.get(id)
      if (row === undefined) return Promise.resolve(false)
      row.revokedAt ??= at
      return Promise.resolve(true)
    },
    raiseCap: (id, maxUses) => {
      const row = rows.get(id)
      if (row?.revokedAt !== null || row.maxUses >= maxUses)
        return Promise.resolve(false)
      row.maxUses = maxUses
      return Promise.resolve(true)
    },
  }
  const invites = createInvites({
    store,
    publicUrl: 'https://match.example.org',
    defaults: () => ({ inviteDefaultMaxUses: 400, inviteDefaultHours: 12 }),
    now: () => now,
    newId: () => `i-${String(rows.size + 1)}`,
  })
  return { invites, rows }
}

describe('createInvites', () => {
  it('fills a missing window and cap from the defaults (R-INV-2,4)', async () => {
    const { invites, rows } = setup()

    const outcome = await invites.create({ label: 'Main stage' }, 'm-host')

    expect(outcome).toMatchObject({
      result: 'created',
      invite: {
        label: 'Main stage',
        validFrom: now.toISOString(),
        validUntil: new Date(now.getTime() + 12 * hour).toISOString(),
        maxUses: 400,
        uses: 0,
        state: 'active',
        createdBy: 'host@example.invalid',
      },
    })
    expect(rows.get('i-1')?.createdBy).toBe('m-host')
  })

  it('carries a join URL with a fresh, unguessable token (R-INV-9)', async () => {
    const { invites } = setup()

    const first = await invites.create({ label: 'A' }, 'm-host')
    const second = await invites.create({ label: 'B' }, 'm-host')

    const tokenOf = (o: typeof first): string =>
      o.result === 'created'
        ? (new URL(o.invite.joinUrl).searchParams.get('invite') ?? '')
        : ''
    expect(tokenOf(first)).toMatch(/^[A-Za-z0-9_-]{24}$/)
    expect(tokenOf(first)).not.toBe(tokenOf(second))
  })

  it('stores whole seconds, so a window from now is active at once', async () => {
    const { invites } = setup()
    const later = new Date(now.getTime() + 600)

    const outcome = await invites.create(
      {
        label: 'A',
        validFrom: later,
        validUntil: new Date(later.getTime() + hour),
      },
      'm-host',
    )

    expect(outcome).toMatchObject({
      invite: { validFrom: now.toISOString(), state: 'active' },
    })
  })

  it('refuses a window that ends before it starts', async () => {
    const { invites, rows } = setup()

    expect(
      await invites.create(
        { label: 'A', validFrom: now, validUntil: now },
        'm-host',
      ),
    ).toEqual({ result: 'bad_window' })
    expect(rows.size).toBe(0)
  })

  it('revokes once, keeping the first revocation time (R-INV-3)', async () => {
    const { invites, rows } = setup()
    await invites.create({ label: 'A' }, 'm-host')

    expect(await invites.revoke('i-1')).toBe('revoked')
    expect(await invites.revoke('i-9')).toBe('not_found')
    expect((await invites.list())[0]?.state).toBe('revoked')
    expect(rows.get('i-1')?.revokedAt).toEqual(now)
  })

  it('raises a cap, never lowers it, and leaves a revoked invite (R-INV-4)', async () => {
    const { invites } = setup()
    await invites.create({ label: 'A', maxUses: 100 }, 'm-host')

    const raised = await invites.raiseCap('i-1', 250)
    expect(raised.result).toBe('raised')
    expect(raised.result === 'raised' && raised.invite.maxUses).toBe(250)
    expect(await invites.raiseCap('i-1', 250)).toEqual({ result: 'not_higher' })
    expect(await invites.raiseCap('i-1', 90)).toEqual({ result: 'not_higher' })
    expect(await invites.raiseCap('i-9', 500)).toEqual({ result: 'not_found' })
    await invites.revoke('i-1')
    expect(await invites.raiseCap('i-1', 500)).toEqual({ result: 'revoked' })
  })
})
