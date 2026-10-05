import { describe, expect, it } from 'vitest'
import type { AnalyticsEvent } from './analytics.js'
import {
  createConnections,
  type ConnectionRecord,
  type ConnectionStore,
  type ConnectionView,
} from './connections.js'

const emails: Record<string, string> = {
  'm-ada': 'ada@example.invalid',
  'm-bob': 'bob@example.invalid',
  'm-eve': 'eve@example.invalid',
}
const challenges: Record<string, string> = {
  'c-ada': 'm-ada',
  'c-bob': 'm-bob',
  'c-bob2': 'm-bob',
  'c-eve': 'm-eve',
}

function fakeStore(): ConnectionStore & {
  rows: Map<string, ConnectionRecord>
  seen: string[]
} {
  const rows = new Map<string, ConnectionRecord>()
  const seen: string[] = []
  const party = (r: ConnectionRecord, m: string): boolean =>
    r.requesterId === m || r.targetId === m
  const pendingId = (
    req: string,
    tgt: string,
    ch: string | null,
  ): string | null =>
    [...rows.values()].find(
      (r) =>
        r.status === 'pending' &&
        r.requesterId === req &&
        r.targetId === tgt &&
        r.challengeId === ch,
    )?.id ?? null
  const acceptedBetween = (a: string, b: string): ConnectionRecord[] =>
    [...rows.values()].filter(
      (r) => r.status === 'accepted' && party(r, a) && party(r, b),
    )
  const viewOf = (r: ConnectionRecord, viewer: string): ConnectionView => ({
    id: r.id,
    direction: r.targetId === viewer ? 'incoming' : 'outgoing',
    kind: r.kind,
    status: r.status,
    message: r.message,
    createdAt: r.createdAt,
    other: {
      memberId: r.targetId === viewer ? r.requesterId : r.targetId,
      name: 'Someone',
      jobTitle: null,
      org: null,
      sector: null,
      companySize: null,
    },
    challenge: null,
    unseen: false,
  })
  return {
    rows,
    seen,
    isReachable: (id) => Promise.resolve(id in emails),
    challengeAuthor: (id) => Promise.resolve(challenges[id] ?? null),
    findPending: (req, tgt, ch) => Promise.resolve(pendingId(req, tgt, ch)),
    insert: (r) => {
      if (pendingId(r.requesterId, r.targetId, r.challengeId) !== null) {
        return Promise.resolve(false)
      }
      rows.set(r.id, {
        ...r,
        status: 'pending',
        createdAt: '2026-11-08T10:00:00.000Z',
      })
      return Promise.resolve(true)
    },
    isConnected: (a, b) => Promise.resolve(acceptedBetween(a, b).length > 0),
    findAccepted: (a, b, ch) =>
      Promise.resolve(
        acceptedBetween(a, b).find((r) => r.challengeId === ch)?.id ?? null,
      ),
    insertAccepted: (r) => {
      rows.set(r.id, {
        ...r,
        status: 'accepted',
        createdAt: '2026-11-08T11:00:00.000Z',
      })
      return Promise.resolve()
    },
    acceptPending: (a, b) => {
      for (const r of rows.values()) {
        if (r.status === 'pending' && party(r, a) && party(r, b))
          rows.set(r.id, { ...r, status: 'accepted' })
      }
      return Promise.resolve()
    },
    remove: (id) => {
      rows.delete(id)
      return Promise.resolve()
    },
    find: (id) => Promise.resolve(rows.get(id) ?? null),
    view: (id, viewer) => {
      const r = rows.get(id)
      if (r === undefined || !party(r, viewer)) return Promise.resolve(null)
      return Promise.resolve(viewOf(r, viewer))
    },
    incoming: () => Promise.resolve([]),
    connected: () => Promise.resolve([]),
    connectedOver: (viewer, other) =>
      Promise.resolve(
        acceptedBetween(viewer, other).map((r) => viewOf(r, viewer)),
      ),
    respond: (id, target, status) => {
      const r = rows.get(id)
      if (r?.targetId !== target || r.status !== 'pending')
        return Promise.resolve(false)
      rows.set(id, { ...r, status })
      return Promise.resolve(true)
    },
    contactFor: (id, viewer) => {
      const r = rows.get(id)
      if (r?.status !== 'accepted' || !party(r, viewer))
        return Promise.resolve(null)
      const other = r.targetId === viewer ? r.requesterId : r.targetId
      return Promise.resolve({ name: other, email: emails[other] ?? '' })
    },
    markSeen: (viewer, other) => {
      seen.push(`${viewer}:${other}`)
      return Promise.resolve()
    },
  }
}

function setup(): {
  service: ReturnType<typeof createConnections>
  store: ReturnType<typeof fakeStore>
  tracked: [string, AnalyticsEvent][]
} {
  let n = 0
  const tracked: [string, AnalyticsEvent][] = []
  const store = fakeStore()
  const service = createConnections({
    store,
    newId: () => `r-${String(++n)}`,
    track: (memberId, event) => {
      tracked.push([memberId, event])
      return Promise.resolve()
    },
  })
  return { service, store, tracked }
}

const sameBoat = {
  targetId: 'm-bob',
  challengeId: 'c-bob',
  kind: 'same_boat',
} as const

describe('telling the target (R-CONN-2)', () => {
  it('notifies the target of a new request, once', async () => {
    const notified: unknown[] = []
    const service = createConnections({
      store: fakeStore(),
      newId: () => 'r-1',
      notify: (request) => {
        notified.push(request)
        return Promise.resolve()
      },
    })

    await service.request('m-ada', sameBoat)
    await service.request('m-ada', sameBoat)
    await service.request('m-ada', { targetId: 'm-ghost', kind: 'same_boat' })

    expect(notified).toEqual([
      { id: 'r-1', requesterId: 'm-ada', targetId: 'm-bob', message: null },
    ])
  })

  it('keeps no request its target could not be told of, so a retry tells them', async () => {
    const store = fakeStore()
    let attempts = 0
    const service = createConnections({
      store,
      newId: () => `r-${String(++attempts)}`,
      notify: () =>
        attempts === 1
          ? Promise.reject(new Error('database went away'))
          : Promise.resolve(),
    })

    await expect(service.request('m-ada', sameBoat)).rejects.toThrow(
      'database went away',
    )
    expect(store.rows.size).toBe(0)
    expect(await service.request('m-ada', sameBoat)).toEqual({
      result: 'created',
      id: 'r-2',
    })
  })
})

describe('telling the requester (R-CONN-7)', () => {
  function accepting(): {
    service: ReturnType<typeof createConnections>
    store: ReturnType<typeof fakeStore>
    told: unknown[]
  } {
    const told: unknown[] = []
    const store = fakeStore()
    const service = createConnections({
      store,
      newId: () => 'r-1',
      notifyAccepted: (request) => {
        told.push(request)
        return Promise.resolve()
      },
    })
    return { service, store, told }
  }

  it('tells the requester once their request is accepted', async () => {
    const { service, told } = accepting()
    await service.request('m-ada', sameBoat)

    await service.respond('m-eve', 'r-1', 'accepted')
    await service.respond('m-bob', 'r-1', 'accepted')
    await service.respond('m-bob', 'r-1', 'accepted')

    expect(told).toEqual([
      { id: 'r-1', requesterId: 'm-ada', targetId: 'm-bob' },
    ])
  })

  it('accepts every other request pending between the two, telling the requester once (R-CONN-11)', async () => {
    const store = fakeStore()
    const told: unknown[] = []
    let n = 0
    const service = createConnections({
      store,
      newId: () => `r-${String(++n)}`,
      notifyAccepted: (request) => {
        told.push(request)
        return Promise.resolve()
      },
    })
    await service.request('m-ada', sameBoat)
    await service.request('m-ada', { ...sameBoat, challengeId: 'c-bob2' })
    await service.request('m-bob', {
      targetId: 'm-ada',
      challengeId: 'c-ada',
      kind: 'same_boat',
    })
    await service.request('m-eve', sameBoat)

    await service.respond('m-bob', 'r-1', 'accepted')

    expect([...store.rows.values()].map((r) => [r.id, r.status])).toEqual([
      ['r-1', 'accepted'],
      ['r-2', 'accepted'],
      ['r-3', 'accepted'],
      ['r-4', 'pending'],
    ])
    expect(told).toHaveLength(1)
  })

  it('leaves the others pending after a decline (R-CONN-4)', async () => {
    const { service, store } = accepting()
    await service.request('m-ada', sameBoat)
    store.rows.set('r-2', {
      ...store.rows.get('r-1')!,
      id: 'r-2',
      challengeId: 'c-bob2',
    })

    await service.respond('m-bob', 'r-1', 'declined')

    expect(store.rows.get('r-2')?.status).toBe('pending')
  })

  it('says nothing of a decline (R-CONN-4)', async () => {
    const { service, told } = accepting()
    await service.request('m-ada', sameBoat)

    await service.respond('m-bob', 'r-1', 'declined')

    expect(told).toEqual([])
  })

  it('ends the notices of whoever opens the contact, for that reader only', async () => {
    const { service, store } = accepting()
    await service.request('m-ada', sameBoat)
    expect(await service.contact('m-ada', 'r-1')).toBeNull()
    expect(store.seen).toEqual([])
    await service.respond('m-bob', 'r-1', 'accepted')

    await service.contact('m-bob', 'r-1')
    expect(store.seen).toEqual(['m-bob:m-ada'])
    await service.contact('m-ada', 'r-1')
    expect(store.seen).toEqual(['m-bob:m-ada', 'm-ada:m-bob'])
  })
})

describe('the double opt-in (ADR 0004)', () => {
  it('creates a pending request and reveals nothing yet (R-CONN-1)', async () => {
    const { service, store } = setup()

    const outcome = await service.request('m-ada', sameBoat)

    expect(outcome).toEqual({ result: 'created', id: 'r-1' })
    expect(store.rows.get('r-1')?.status).toBe('pending')
    expect(await service.contact('m-ada', 'r-1')).toBeNull()
    expect(await service.contact('m-bob', 'r-1')).toBeNull()
  })

  it('surfaces the existing request instead of a duplicate (R-CONN-5)', async () => {
    const { service } = setup()
    await service.request('m-ada', sameBoat)

    expect(
      await service.request('m-ada', { ...sameBoat, kind: 'been_there' }),
    ).toEqual({
      result: 'exists',
      id: 'r-1',
    })
  })

  it('allows a new request once the earlier one was answered (R-CONN-5)', async () => {
    const { service } = setup()
    await service.request('m-ada', sameBoat)
    await service.respond('m-bob', 'r-1', 'declined')

    expect(await service.request('m-ada', sameBoat)).toEqual({
      result: 'created',
      id: 'r-2',
    })
  })

  it('answers a request that lost a race with the one that won (R-CONN-5)', async () => {
    const store = fakeStore()
    const service = createConnections({ store, newId: () => 'r-late' })
    let checks = 0
    const realFind = store.findPending.bind(store)
    store.findPending = (...args) =>
      ++checks === 1 ? Promise.resolve(null) : realFind(...args)
    store.rows.set('r-won', {
      id: 'r-won',
      requesterId: 'm-ada',
      targetId: 'm-bob',
      challengeId: 'c-bob',
      kind: 'same_boat',
      message: null,
      status: 'pending',
      createdAt: '2026-11-08T10:00:00.000Z',
    })

    expect(await service.request('m-ada', sameBoat)).toEqual({
      result: 'exists',
      id: 'r-won',
    })
  })

  it.each([
    ['oneself', { targetId: 'm-ada', kind: 'same_boat' as const }],
    ['nobody reachable', { targetId: 'm-ghost', kind: 'same_boat' as const }],
    ["a stranger's challenge", { ...sameBoat, challengeId: 'c-eve' }],
    ['a challenge that is gone', { ...sameBoat, challengeId: 'c-none' }],
  ])('will not request %s', async (_name, input) => {
    const { service, store } = setup()

    expect(await service.request('m-ada', input)).toEqual({
      result: 'not_found',
    })
    expect(store.rows.size).toBe(0)
  })

  it('reports a created request and its answer, not a repeat (R-ANA-1)', async () => {
    const { service, tracked } = setup()

    await service.request('m-ada', sameBoat)
    await service.request('m-ada', sameBoat)
    await service.respond('m-eve', 'r-1', 'accepted')
    await service.respond('m-bob', 'r-1', 'accepted')

    expect(tracked).toEqual([
      ['m-ada', { name: 'connection_requested', kind: 'same_boat' }],
      ['m-bob', { name: 'connection_responded', status: 'accepted' }],
    ])
  })

  it('lets only the target answer, and only once (R-CONN-3,4)', async () => {
    const { service } = setup()
    await service.request('m-ada', sameBoat)

    expect(await service.respond('m-ada', 'r-1', 'accepted')).toBe('not_found')
    expect(await service.respond('m-eve', 'r-1', 'accepted')).toBe('not_found')
    expect(await service.respond('m-bob', 'r-1', 'accepted')).toBe('done')
    expect(await service.respond('m-bob', 'r-1', 'declined')).toBe('not_found')
  })

  it('shows each party the other’s email once accepted, with a mailto (R-CONN-3)', async () => {
    const { service } = setup()
    await service.request('m-ada', sameBoat)
    await service.respond('m-bob', 'r-1', 'accepted')

    const contact = await service.contact('m-ada', 'r-1')
    expect(contact?.email).toBe('bob@example.invalid')
    expect(contact?.mailto).toMatch(/^mailto:bob@example\.invalid\?subject=/)
    expect((await service.contact('m-bob', 'r-1'))?.email).toBe(
      'ada@example.invalid',
    )
  })

  it('never shows a third party anything, even once accepted (R-CONN-6)', async () => {
    const { service } = setup()
    await service.request('m-ada', sameBoat)
    await service.respond('m-bob', 'r-1', 'accepted')

    expect(await service.contact('m-eve', 'r-1')).toBeNull()
    expect(await service.get('m-eve', 'r-1')).toBeNull()
  })

  it('keeps both emails private for good after a decline (R-CONN-4)', async () => {
    const { service } = setup()
    await service.request('m-ada', sameBoat)
    await service.respond('m-bob', 'r-1', 'declined')

    expect(await service.contact('m-ada', 'r-1')).toBeNull()
    expect(await service.contact('m-bob', 'r-1')).toBeNull()
    expect(await service.respond('m-bob', 'r-1', 'accepted')).toBe('not_found')
  })
})

describe('already connected (R-CONN-8, R-CONN-9, ADR 0035)', () => {
  async function connected(): Promise<{
    service: ReturnType<typeof createConnections>
    store: ReturnType<typeof fakeStore>
    asked: unknown[]
    added: unknown[]
    tracked: AnalyticsEvent[]
  }> {
    let n = 0
    const asked: unknown[] = []
    const added: unknown[] = []
    const tracked: AnalyticsEvent[] = []
    const store = fakeStore()
    const service = createConnections({
      store,
      newId: () => `r-${String(++n)}`,
      track: (_memberId, event) => {
        tracked.push(event)
        return Promise.resolve()
      },
      notify: (request) => {
        asked.push(request)
        return Promise.resolve()
      },
      notifyAdded: (request) => {
        added.push(request)
        return Promise.resolve()
      },
    })
    await service.request('m-ada', sameBoat)
    await service.respond('m-bob', 'r-1', 'accepted')
    asked.length = 0
    tracked.length = 0
    return { service, store, asked, added, tracked }
  }

  it('accepts a request about another challenge at once and tells the target', async () => {
    const { service, store, asked, added } = await connected()

    const outcome = await service.request('m-ada', {
      targetId: 'm-bob',
      challengeId: 'c-bob2',
      kind: 'been_there',
      message: 'We did this last year.',
    })

    expect(outcome).toEqual({ result: 'joined', id: 'r-2' })
    expect(store.rows.get('r-2')?.status).toBe('accepted')
    expect(asked).toEqual([])
    expect(added).toEqual([
      {
        id: 'r-2',
        requesterId: 'm-ada',
        targetId: 'm-bob',
        message: 'We did this last year.',
      },
    ])
  })

  it('joins whichever side asks', async () => {
    const { service, added } = await connected()

    expect(
      await service.request('m-bob', {
        targetId: 'm-ada',
        challengeId: 'c-ada',
        kind: 'same_boat',
      }),
    ).toEqual({ result: 'joined', id: 'r-2' })
    expect(added).toHaveLength(1)
  })

  it('adds nothing about a challenge they are already connected over', async () => {
    const { service, store, added, tracked } = await connected()

    expect(await service.request('m-ada', sameBoat)).toEqual({
      result: 'joined',
      id: 'r-1',
    })
    expect(store.rows.size).toBe(1)
    expect(added).toEqual([])
    expect(tracked).toEqual([])
  })

  it('reports a connection added as requested (R-ANA-1)', async () => {
    const { service, tracked } = await connected()

    await service.request('m-ada', { ...sameBoat, challengeId: 'c-bob2' })

    expect(tracked).toEqual([
      { name: 'connection_requested', kind: 'same_boat' },
    ])
  })

  it('keeps no connection its target could not be told of', async () => {
    const store = fakeStore()
    store.rows.set('r-0', {
      id: 'r-0',
      requesterId: 'm-ada',
      targetId: 'm-bob',
      challengeId: 'c-bob',
      kind: 'same_boat',
      message: null,
      status: 'accepted',
      createdAt: '2026-11-08T10:00:00.000Z',
    })
    const service = createConnections({
      store,
      newId: () => 'r-1',
      notifyAdded: () => Promise.reject(new Error('mail went away')),
    })

    await expect(
      service.request('m-ada', { ...sameBoat, challengeId: 'c-bob2' }),
    ).rejects.toThrow('mail went away')
    expect([...store.rows.keys()]).toEqual(['r-0'])
  })

  it('still asks a member connected only to someone else', async () => {
    const { service, added } = await connected()

    expect(
      await service.request('m-eve', {
        targetId: 'm-bob',
        challengeId: 'c-bob',
        kind: 'same_boat',
      }),
    ).toEqual({ result: 'created', id: 'r-2' })
    expect(added).toEqual([])
  })

  it('lists on the contact everything the two are connected over (R-CONN-10)', async () => {
    const { service } = await connected()
    await service.request('m-bob', {
      targetId: 'm-ada',
      challengeId: 'c-ada',
      kind: 'same_boat',
    })
    await service.request('m-eve', sameBoat)

    const contact = await service.contact('m-ada', 'r-1')

    expect(contact?.over.map((each) => each.id)).toEqual(['r-1', 'r-2'])
  })
})
