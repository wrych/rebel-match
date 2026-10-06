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

/** A notification the store wrote with its event (R-NOTE-10). */
interface Told {
  to: string
  type: 'connection_request' | 'new_connection'
  id: string
}

function fakeStore(): ConnectionStore & {
  rows: Map<string, ConnectionRecord>
  seen: string[]
  told: Told[]
} {
  const rows = new Map<string, ConnectionRecord>()
  const seen: string[] = []
  const told: Told[] = []
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
    told,
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
      told.push({ to: r.targetId, type: 'connection_request', id: r.id })
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
      told.push({ to: r.targetId, type: 'new_connection', id: r.id })
      return Promise.resolve()
    },
    acceptPending: (a, b) => {
      for (const r of rows.values()) {
        if (r.status === 'pending' && party(r, a) && party(r, b))
          rows.set(r.id, { ...r, status: 'accepted' })
      }
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
      if (status === 'accepted')
        told.push({ to: r.requesterId, type: 'new_connection', id })
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
  it('stores the target’s notification with a new request, once', async () => {
    const { service, store } = setup()

    await service.request('m-ada', sameBoat)
    await service.request('m-ada', sameBoat)
    await service.request('m-ada', { targetId: 'm-ghost', kind: 'same_boat' })

    expect(store.told).toEqual([
      { to: 'm-bob', type: 'connection_request', id: 'r-1' },
    ])
  })
})

describe('telling the requester (R-CONN-7)', () => {
  function accepting(): {
    service: ReturnType<typeof createConnections>
    store: ReturnType<typeof fakeStore>
  } {
    const store = fakeStore()
    return { service: createConnections({ store, newId: () => 'r-1' }), store }
  }

  // What the store told requesters, leaving out the targets' requests.
  const accepted = (store: ReturnType<typeof fakeStore>): Told[] =>
    store.told.filter((each) => each.type === 'new_connection')

  it('tells the requester once their request is accepted', async () => {
    const { service, store } = accepting()
    await service.request('m-ada', sameBoat)

    await service.respond('m-eve', 'r-1', 'accepted')
    await service.respond('m-bob', 'r-1', 'accepted')
    await service.respond('m-bob', 'r-1', 'accepted')

    expect(accepted(store)).toEqual([
      { to: 'm-ada', type: 'new_connection', id: 'r-1' },
    ])
  })

  it('accepts every other request pending between the two, telling the requester once (R-CONN-11)', async () => {
    const { service, store } = setup()
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
    expect(accepted(store)).toHaveLength(1)
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
    const { service, store } = accepting()
    await service.request('m-ada', sameBoat)

    await service.respond('m-bob', 'r-1', 'declined')

    expect(accepted(store)).toEqual([])
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
    asked: () => Told[]
    added: () => Told[]
    tracked: AnalyticsEvent[]
  }> {
    let n = 0
    const tracked: AnalyticsEvent[] = []
    const store = fakeStore()
    const service = createConnections({
      store,
      newId: () => `r-${String(++n)}`,
      track: (_memberId, event) => {
        tracked.push(event)
        return Promise.resolve()
      },
    })
    await service.request('m-ada', sameBoat)
    await service.respond('m-bob', 'r-1', 'accepted')
    store.told.length = 0
    tracked.length = 0
    // What the store told since: new requests, and connections added to their
    // targets (R-CONN-9).
    const told = (type: Told['type']) => (): Told[] =>
      store.told.filter((each) => each.type === type)
    return {
      service,
      store,
      asked: told('connection_request'),
      added: told('new_connection'),
      tracked,
    }
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
    expect(asked()).toEqual([])
    expect(added()).toEqual([
      { to: 'm-bob', type: 'new_connection', id: 'r-2' },
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
    expect(added()).toHaveLength(1)
  })

  it('adds nothing about a challenge they are already connected over', async () => {
    const { service, store, added, tracked } = await connected()

    expect(await service.request('m-ada', sameBoat)).toEqual({
      result: 'joined',
      id: 'r-1',
    })
    expect(store.rows.size).toBe(1)
    expect(added()).toEqual([])
    expect(tracked).toEqual([])
  })

  it('reports a connection added as requested (R-ANA-1)', async () => {
    const { service, tracked } = await connected()

    await service.request('m-ada', { ...sameBoat, challengeId: 'c-bob2' })

    expect(tracked).toEqual([
      { name: 'connection_requested', kind: 'same_boat' },
    ])
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
    expect(added()).toEqual([])
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
