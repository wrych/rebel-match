import { describe, expect, it } from 'vitest'
import type { ConnectionService } from './connections.js'
import type { DeckService } from './deck.js'
import {
  createNotifications,
  markingDeckOpened,
  markingOpened,
  type NotificationRow,
  type NotificationStore,
} from './notifications.js'

function recordingStore(rows: NotificationRow[] = []): {
  store: NotificationStore
  calls: unknown[]
} {
  const calls: unknown[] = []
  const store: NotificationStore = {
    list: (memberId, before, limit) => {
      calls.push(['list', memberId, before, limit])
      return Promise.resolve(rows)
    },
    newCount: () => Promise.resolve(3),
    markSeen: (memberId, ids) => {
      calls.push(['seen', memberId, ids])
      return Promise.resolve()
    },
    markSeenForConnection: (memberId, id, between) => {
      calls.push(['seen-connection', memberId, id, between])
      return Promise.resolve()
    },
    markSeenForChallenge: (memberId, challengeId) => {
      calls.push(['seen-challenge', memberId, challengeId])
      return Promise.resolve()
    },
    markSeenForApplicants: (memberId) => {
      calls.push(['seen-applicants', memberId])
      return Promise.resolve()
    },
  }
  return { store, calls }
}

const at = new Date('2026-10-06T08:00:00.000Z')
const row = (over: Partial<NotificationRow>): NotificationRow => ({
  id: 'n1',
  type: 'connection_request',
  createdAt: at,
  seenAt: null,
  aboutName: 'Bea There',
  connectionId: 'r/1',
  recipientRequested: false,
  challengeId: null,
  trend: null,
  ...over,
})

describe('createNotifications', () => {
  it('words each entry and links it where it comes from (R-NOTE-5)', async () => {
    const { store, calls } = recordingStore([
      row({ id: 'a' }),
      row({ id: 'b', type: 'new_connection', recipientRequested: true }),
      row({ id: 'c', type: 'new_connection', seenAt: at }),
      row({ id: 'd', type: 'applicant', connectionId: null }),
      row({
        id: 'e',
        type: 'trend_challenge',
        connectionId: null,
        challengeId: 'c/1',
        trend: 'Radical Transparency',
      }),
    ])
    const notes = createNotifications({ store, pageSize: () => 20 })

    const list = await notes.list('bob', 'n0')

    expect(calls).toEqual([['list', 'bob', 'n0', 20]])
    expect(list.map((n) => [n.id, n.kind, n.path, n.isNew])).toEqual([
      ['a', 'connection_request', '/matches/requests/r%2F1', true],
      ['b', 'connection_accepted', '/matches/requests/r%2F1/contact', true],
      ['c', 'connection_added', '/matches/requests/r%2F1/contact', false],
      ['d', 'applicant', '/admin/applicants', true],
      ['e', 'trend_challenge', '/offer?challenge=c%2F1', true],
    ])
    expect(list.map((n) => n.trend)).toEqual([
      null,
      null,
      null,
      null,
      'Radical Transparency',
    ])
    expect(list[0]).toMatchObject({
      name: 'Bea There',
      at: '2026-10-06T08:00:00.000Z',
    })
  })

  it('marks seen only what it is given (R-NOTE-5)', async () => {
    const { store, calls } = recordingStore()
    const notes = createNotifications({ store, pageSize: () => 50 })

    await notes.seen('bob', [])
    await notes.seen('bob', ['n1'])
    await notes.openedConnection('bob', 'r1', true)
    await notes.openedApplicants('bob')
    await notes.openedChallenge('bob', 'c1')

    expect(calls).toEqual([
      ['seen', 'bob', ['n1']],
      ['seen-connection', 'bob', 'r1', true],
      ['seen-applicants', 'bob'],
      ['seen-challenge', 'bob', 'c1'],
    ])
    expect(await notes.newCount('bob')).toBe(3)
  })
})

describe('markingOpened', () => {
  const view = { id: 'r1' } as Awaited<ReturnType<ConnectionService['get']>>
  const contact = { name: 'Bea' } as Awaited<
    ReturnType<ConnectionService['contact']>
  >

  function connections(found: boolean): ConnectionService {
    return {
      get: () => Promise.resolve(found ? view : null),
      contact: () => Promise.resolve(found ? contact : null),
    } as unknown as ConnectionService
  }

  it('marks the reader’s notifications seen when a request or its contact opens', async () => {
    const opened: unknown[] = []
    const wrapped = markingOpened(connections(true), {
      openedConnection: (...args) => {
        opened.push(args)
        return Promise.resolve()
      },
    })

    expect(await wrapped.get('bob', 'r1')).toBe(view)
    expect(await wrapped.contact('bob', 'r1')).toBe(contact)
    expect(opened).toEqual([
      ['bob', 'r1', false],
      ['bob', 'r1', true],
    ])
  })

  it('marks nothing for a request the reader cannot open (R-NAV-8)', async () => {
    const opened: unknown[] = []
    const wrapped = markingOpened(connections(false), {
      openedConnection: (...args) => {
        opened.push(args)
        return Promise.resolve()
      },
    })

    expect(await wrapped.get('eve', 'r1')).toBeNull()
    expect(await wrapped.contact('eve', 'r1')).toBeNull()
    expect(opened).toEqual([])
  })
})

describe('markingDeckOpened (R-OFF-7, R-NOTE-5)', () => {
  const card = (
    challengeId: string,
  ): Awaited<ReturnType<DeckService['next']>>[number] =>
    ({ challengeId }) as Awaited<ReturnType<DeckService['next']>>[number]

  it('marks the new-challenge notification seen when the deck opens at its card', async () => {
    const opened: unknown[] = []
    const asked: unknown[] = []
    const deck = markingDeckOpened(
      {
        next: (viewer, first) => {
          asked.push([viewer, first])
          return Promise.resolve(
            first === 'c1' ? [card('c1'), card('c2')] : [card('c2')],
          )
        },
      },
      {
        openedChallenge: (...args) => {
          opened.push(args)
          return Promise.resolve()
        },
      },
    )

    await deck.next('bob', 'c1')
    await deck.next('bob', 'gone')
    await deck.next('bob')

    expect(asked).toEqual([
      ['bob', 'c1'],
      ['bob', 'gone'],
      ['bob', undefined],
    ])
    expect(opened).toEqual([['bob', 'c1']])
  })
})
