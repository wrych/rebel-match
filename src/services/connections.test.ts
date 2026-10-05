import { describe, expect, it } from 'vitest'
import type { AnalyticsEvent } from './analytics.js'
import {
  createConnections,
  type ConnectionRecord,
  type ConnectionStore,
} from './connections.js'

const emails: Record<string, string> = {
  'm-ada': 'ada@example.invalid',
  'm-bob': 'bob@example.invalid',
  'm-eve': 'eve@example.invalid',
}
const challenges: Record<string, string> = {
  'c-bob': 'm-bob',
  'c-eve': 'm-eve',
}

function fakeStore(): ConnectionStore & {
  rows: Map<string, ConnectionRecord>
} {
  const rows = new Map<string, ConnectionRecord>()
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
  return {
    rows,
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
    remove: (id) => {
      rows.delete(id)
      return Promise.resolve()
    },
    find: (id) => Promise.resolve(rows.get(id) ?? null),
    view: (id, viewer) => {
      const r = rows.get(id)
      if (r === undefined || !party(r, viewer)) return Promise.resolve(null)
      return Promise.resolve({
        id,
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
      })
    },
    incoming: () => Promise.resolve([]),
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
