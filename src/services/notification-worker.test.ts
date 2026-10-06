import { describe, expect, it } from 'vitest'
import {
  createNotificationWorker,
  retryAfter,
  skipReason,
  startNotificationWorker,
  type DueNotification,
  type NotificationMailStore,
} from './notification-worker.js'

const now = new Date('2026-11-08T10:00:00.000Z')
const settings = {
  intervalSeconds: 60,
  maxAttempts: 5,
  firstRetrySeconds: 60,
  holdSeconds: 300,
  batch: 100,
}

const due = (over: Partial<DueNotification> = {}): DueNotification => ({
  id: 'n1',
  type: 'connection_request',
  recipientId: 'm-bob',
  aboutMemberId: 'm-ada',
  connectionId: 'r1',
  createdAt: now,
  attempts: 0,
  seen: false,
  hidden: false,
  recipientActive: true,
  aboutDeleted: false,
  requestStatus: 'pending',
  applicantStatus: null,
  applicantEmail: null,
  ...over,
})

describe('skipReason (R-NOTE-9)', () => {
  it.each([
    ['nothing in the way', {}, null],
    ['hidden, its type off', { hidden: true }, 'off'],
    ['seen in the app', { seen: true }, 'seen'],
    ['a recipient no longer active', { recipientActive: false }, 'stale'],
    ['about a deleted member', { aboutDeleted: true }, 'stale'],
    ['a request answered', { requestStatus: 'declined' as const }, 'stale'],
    [
      'a new connection, accepted',
      { type: 'new_connection' as const, requestStatus: 'accepted' as const },
      null,
    ],
    [
      'an applicant still waiting',
      { type: 'applicant' as const, applicantStatus: 'applicant' },
      null,
    ],
    [
      'an applicant decided',
      { type: 'applicant' as const, applicantStatus: 'active' },
      'stale',
    ],
  ])('mails %s or says why not', (_case, over, reason) => {
    expect(skipReason(due(over))).toBe(reason)
  })
})

describe('retryAfter (R-NOTE-10)', () => {
  it('waits a minute, then twice as long each time, then gives up', () => {
    const three = { maxAttempts: 3, firstRetrySeconds: 60 }
    expect(retryAfter(1, three, now)?.toISOString()).toBe(
      '2026-11-08T10:01:00.000Z',
    )
    expect(retryAfter(2, three, now)?.toISOString()).toBe(
      '2026-11-08T10:02:00.000Z',
    )
    expect(retryAfter(3, three, now)).toBeNull()
  })
})

function recording(notes: DueNotification[]): {
  store: NotificationMailStore
  calls: unknown[]
} {
  const calls: unknown[] = []
  const store: NotificationMailStore = {
    claimDue: (at, limit, holdUntil) => {
      calls.push(['claim', at.toISOString(), limit, holdUntil.toISOString()])
      return Promise.resolve(notes)
    },
    mailed: (id, cadence) => {
      calls.push(['mailed', id, cadence])
      return Promise.resolve()
    },
    skipped: (id, reason) => {
      calls.push(['skipped', id, reason])
      return Promise.resolve()
    },
    retryAt: (id, attempts, at) => {
      calls.push(['retry', id, attempts, at.toISOString()])
      return Promise.resolve()
    },
    failed: (id, attempts) => {
      calls.push(['failed', id, attempts])
      return Promise.resolve()
    },
  }
  return { store, calls }
}

describe('createNotificationWorker', () => {
  it('mails what is due, leaves out the stale, and retries a refused mail (R-NOTE-7..10)', async () => {
    const { store, calls } = recording([
      due({ id: 'sent' }),
      due({ id: 'seen', seen: true }),
      due({ id: 'refused', attempts: 0 }),
      due({ id: 'spent', attempts: 4 }),
      due({ id: 'nobody' }),
    ])
    const sent: string[] = []
    const worker = createNotificationWorker({
      store,
      send: (note) => {
        sent.push(note.id)
        if (note.id === 'nobody') return Promise.resolve(null)
        return Promise.resolve(
          note.id === 'refused' || note.id === 'spent' ? 'failed' : 'sent',
        )
      },
      settings: () => settings,
      now: () => now,
      onError: () => undefined,
    })

    await worker.deliverDue()

    expect(sent).toEqual(['sent', 'refused', 'spent', 'nobody'])
    expect(calls).toEqual([
      ['claim', '2026-11-08T10:00:00.000Z', 100, '2026-11-08T10:05:00.000Z'],
      ['mailed', 'sent', 'immediately'],
      ['skipped', 'seen', 'seen'],
      ['retry', 'refused', 1, '2026-11-08T10:01:00.000Z'],
      ['failed', 'spent', 5],
      ['skipped', 'nobody', 'stale'],
    ])
  })

  it('counts a suppressed mail as delivered: the outbound log holds it (R-DEV-1)', async () => {
    const { store, calls } = recording([due()])
    const worker = createNotificationWorker({
      store,
      send: () => Promise.resolve('suppressed'),
      settings: () => settings,
      now: () => now,
      onError: () => undefined,
    })

    await worker.deliverDue()

    expect(calls.at(-1)).toEqual(['mailed', 'n1', 'immediately'])
  })

  it('counts a send that throws as refused, so its attempts are capped', async () => {
    const { store, calls } = recording([
      due({ id: 'a' }),
      due({ id: 'b', attempts: 4 }),
    ])
    const errors: unknown[] = []
    const worker = createNotificationWorker({
      store,
      send: () => Promise.reject(new Error('connection lost')),
      settings: () => settings,
      now: () => now,
      onError: (error) => errors.push(error),
    })

    await worker.deliverDue()

    expect(errors).toHaveLength(2)
    expect(calls.slice(1)).toEqual([
      ['retry', 'a', 1, '2026-11-08T10:01:00.000Z'],
      ['failed', 'b', 5],
    ])
  })

  it('reports a store that fails and goes on with the rest', async () => {
    const { store, calls } = recording([due({ id: 'a' }), due({ id: 'b' })])
    const errors: unknown[] = []
    const worker = createNotificationWorker({
      store,
      send: () => Promise.resolve('sent'),
      settings: () => settings,
      now: () => now,
      onError: (error) => errors.push(error),
    })
    store.mailed = (id, cadence) => {
      if (id === 'a') return Promise.reject(new Error('database went away'))
      calls.push(['mailed', id, cadence])
      return Promise.resolve()
    }

    await worker.deliverDue()

    expect(errors).toHaveLength(1)
    expect(calls.at(-1)).toEqual(['mailed', 'b', 'immediately'])
  })
})

describe('startNotificationWorker', () => {
  it('runs at once and then on the interval, one run at a time', async () => {
    let runs = 0
    let finish: () => void = () => undefined
    let tick: () => void = () => undefined
    const stop = startNotificationWorker({
      worker: {
        deliverDue: () => {
          runs++
          return new Promise<void>((resolve) => {
            finish = resolve
          })
        },
      },
      intervalSeconds: 60,
      onError: () => undefined,
      schedule: (run, everyMs) => {
        expect(everyMs).toBe(60_000)
        tick = run
        return () => undefined
      },
    })

    tick()
    expect(runs).toBe(1)
    finish()
    await Promise.resolve()
    await Promise.resolve()
    tick()
    expect(runs).toBe(2)
    stop()
  })
})
