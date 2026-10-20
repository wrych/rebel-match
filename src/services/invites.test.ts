import { describe, expect, it } from 'vitest'
import type { AnalyticsEvent } from './analytics.js'
import {
  createInvites,
  inviteState,
  joinUrl,
  type Invite,
  type InviteStore,
  type ListedInvite,
  type StoredEventBadge,
} from './invites.js'
import { cleanLogo } from './logo.js'

const LOGO_MAX_BYTES = 32_768

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
    eventBadgeId: null,
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
  badges: Map<string, StoredEventBadge>
  joined: Map<string, string[]>
  holders: Set<string>
  tracked: [string, AnalyticsEvent][]
} {
  const rows = new Map<string, ListedInvite>()
  const badges = new Map<string, StoredEventBadge>()
  // Who each invite admitted, and each member:badge already held.
  const joined = new Map<string, string[]>()
  const holders = new Set<string>()
  const tracked: [string, AnalyticsEvent][] = []
  const viewOf = (id: string | null): ListedInvite['eventBadge'] => {
    const badge = id === null ? undefined : badges.get(id)
    return badge === undefined
      ? null
      : {
          id: badge.id,
          name: badge.name,
          ticketLine: badge.ticketLine,
          bigLine: badge.bigLine,
          hasLogo: badge.logoSvg !== null,
        }
  }
  const store: InviteStore = {
    list: () => Promise.resolve([...rows.values()]),
    find: (id) => Promise.resolve(rows.get(id) ?? null),
    insert: (row, newBadge) => {
      if (newBadge !== null) badges.set(newBadge.id, newBadge)
      rows.set(row.id, {
        ...row,
        uses: 0,
        opens: 0,
        revokedAt: null,
        createdAt: now,
        creatorEmail: 'host@example.invalid',
        eventBadge: viewOf(row.eventBadgeId),
      })
      return Promise.resolve()
    },
    setBadge: (inviteId, badgeId, newBadge) => {
      const row = rows.get(inviteId)
      if (row === undefined) return Promise.resolve(null)
      if (newBadge !== null) badges.set(newBadge.id, newBadge)
      row.eventBadgeId = badgeId
      row.eventBadge = viewOf(badgeId)
      if (badgeId === null) return Promise.resolve([])
      const earned = (joined.get(inviteId) ?? []).filter(
        (member) => !holders.has(`${member}:${badgeId}`),
      )
      for (const member of earned) holders.add(`${member}:${badgeId}`)
      return Promise.resolve(earned)
    },
    badgeExists: (id) => Promise.resolve(badges.has(id)),
    logo: (id) => Promise.resolve(badges.get(id)?.logoSvg ?? null),
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
    newId: () => `i-${String(rows.size + badges.size + 1)}`,
    cleanLogo: (text) => cleanLogo(text, LOGO_MAX_BYTES),
    track: (memberId, event) => {
      tracked.push([memberId, event])
      return Promise.resolve()
    },
  })
  return { invites, rows, badges, joined, holders, tracked }
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

describe('event badges on invites (R-BADGE-4, R-BADGE-5)', () => {
  const logo =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" onload="alert(1)">' +
    '<script>alert(1)</script><path d="M2 2h20v20z"/></svg>'
  const summit = {
    name: 'Stormed the Summit',
    ticketLine: 'SUMMIT',
    bigLine: '2026',
  }

  it('gives an invite a new badge, its logo cleaned to drawing only', async () => {
    const { invites } = setup()

    const outcome = await invites.create(
      { label: 'Main stage', eventBadge: { ...summit, logoSvg: logo } },
      'm-host',
    )

    expect(outcome).toMatchObject({
      result: 'created',
      invite: { eventBadge: { ...summit, hasLogo: true } },
    })
    const id =
      outcome.result === 'created' ? (outcome.invite.eventBadge?.id ?? '') : ''
    const stored = await invites.logo(id)
    expect(stored).toContain('<path d="M2 2h20v20z"')
    expect(stored).not.toMatch(/script|onload|alert/)
  })

  it('gives a second poster the same badge, and none without asking', async () => {
    const { invites, badges } = setup()
    const first = await invites.create(
      { label: 'Main stage', eventBadge: summit },
      'm-host',
    )
    const badgeId =
      first.result === 'created' ? (first.invite.eventBadge?.id ?? '') : ''

    const second = await invites.create(
      { label: 'Workshop room', eventBadgeId: badgeId },
      'm-host',
    )
    const plain = await invites.create({ label: 'Lobby' }, 'm-host')

    expect(second).toMatchObject({
      invite: { eventBadge: { id: badgeId, hasLogo: false } },
    })
    expect(plain).toMatchObject({ invite: { eventBadge: null } })
    expect(badges.size).toBe(1)
  })

  it('refuses a logo with nothing drawable, storing nothing', async () => {
    const { invites, rows, badges } = setup()

    const outcome = await invites.create(
      {
        label: 'Main stage',
        eventBadge: {
          ...summit,
          logoSvg: '<svg><script>alert(1)</script></svg>',
        },
      },
      'm-host',
    )

    expect(outcome).toEqual({ result: 'bad_logo' })
    expect(rows.size).toBe(0)
    expect(badges.size).toBe(0)
  })

  it('refuses a badge that does not exist', async () => {
    const { invites, rows } = setup()

    expect(
      await invites.create({ label: 'Lobby', eventBadgeId: 'nope' }, 'm-host'),
    ).toEqual({ result: 'unknown_badge' })
    expect(rows.size).toBe(0)
  })
})

describe("an existing invite's badge (R-INV-13)", () => {
  const summit = { name: 'Summit', ticketLine: 'SUMMIT', bigLine: '2026' }

  async function made(
    invites: ReturnType<typeof setup>['invites'],
  ): Promise<string> {
    const outcome = await invites.create({ label: 'Main stage' }, 'm-host')
    return outcome.result === 'created' ? outcome.invite.id : ''
  }

  it('gives it a new badge, earned by those it admitted who lack it, each reported', async () => {
    const { invites, joined, holders, tracked } = setup()
    const id = await made(invites)
    joined.set(id, ['m-ana', 'm-bob'])

    const outcome = await invites.setBadge(id, { eventBadge: summit })

    expect(outcome).toMatchObject({
      result: 'set',
      invite: { id, eventBadge: { ...summit, hasLogo: false } },
    })
    expect([...holders].map((held) => held.split(':')[0])).toEqual([
      'm-ana',
      'm-bob',
    ])
    expect(tracked).toEqual([
      ['m-ana', { name: 'badge_earned', row: 'event' }],
      ['m-bob', { name: 'badge_earned', row: 'event' }],
    ])
  })

  it("changes it to another invite's badge, or removes it", async () => {
    const { invites } = setup()
    const first = await invites.create(
      { label: 'Poster', eventBadge: summit },
      'm-host',
    )
    const badgeId =
      first.result === 'created' ? (first.invite.eventBadge?.id ?? '') : ''
    const id = await made(invites)

    expect(await invites.setBadge(id, { eventBadgeId: badgeId })).toMatchObject(
      { invite: { eventBadge: { id: badgeId } } },
    )
    expect(await invites.setBadge(id, {})).toMatchObject({
      invite: { eventBadge: null },
    })
  })

  it('says why not, storing nothing', async () => {
    const { invites, badges } = setup()
    const id = await made(invites)

    expect(await invites.setBadge('nope', {})).toEqual({ result: 'not_found' })
    expect(await invites.setBadge(id, { eventBadgeId: 'nope' })).toEqual({
      result: 'unknown_badge',
    })
    expect(
      await invites.setBadge(id, {
        eventBadge: { ...summit, logoSvg: '<svg><script/></svg>' },
      }),
    ).toEqual({ result: 'bad_logo' })
    expect(badges.size).toBe(0)
  })
})
