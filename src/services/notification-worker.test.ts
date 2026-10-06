import { describe, expect, it } from 'vitest'
import type { Cadence } from './notification-cadence.js'
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
  dailyAt: '08:00',
  timeZone: 'Europe/Zurich',
}

const due = (over: Partial<DueNotification> = {}): DueNotification => ({
  id: 'n1',
  type: 'connection_request',
  recipientId: 'm-bob',
  aboutMemberId: 'm-ada',
  connectionId: 'r1',
  createdAt: now,
  attempts: 0,
  cadence: 'immediately',
  seen: false,
  hidden: false,
  recipientActive: true,
  aboutDeleted: false,
  requestStatus: 'pending',
  applicantStatus: null,
  applicantEmail: null,
  challengeId: null,
  challengeActive: false,
  trend: null,
  ...over,
})

describe('skipReason (R-NOTE-3, R-NOTE-9)', () => {
  it.each([
    ['nothing in the way', {}, null],
    ['hidden, its type off', { hidden: true }, 'off'],
    ['its type set to off', { cadence: 'off' as const }, 'off'],
    ['its type kept in the app', { cadence: 'in_app' as const }, 'in_app'],
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
      'a new challenge still shown',
      { type: 'trend_challenge' as const, challengeActive: true },
      null,
    ],
    [
      'a new challenge no longer shown',
      { type: 'trend_challenge' as const, challengeActive: false },
      'stale',
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
  it('waits the first wait, then twice as long each time, then gives up', () => {
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

function recording(
  notes: DueNotification[],
  last: Partial<Record<Cadence, Date>> = {},
): { store: NotificationMailStore; calls: unknown[] } {
  const calls: unknown[] = []
  const push = (call: unknown[]): Promise<void> => {
    calls.push(call)
    return Promise.resolve()
  }
  const store: NotificationMailStore = {
    claimDue: (at, limit, holdUntil) => {
      calls.push(['claim', at.toISOString(), limit, holdUntil.toISOString()])
      return Promise.resolve(notes)
    },
    lastMailed: (_recipient, cadence) => Promise.resolve(last[cadence] ?? null),
    mailed: (ids, cadence) => push(['mailed', ids, cadence]),
    skipped: (id, reason) => push(['skipped', id, reason]),
    deferUntil: (ids, at) => push(['defer', ids, at.toISOString()]),
    retryAt: (ids, attempts, at) =>
      push(['retry', ids, attempts, at.toISOString()]),
    failed: (ids, attempts) => push(['failed', ids, attempts]),
  }
  return { store, calls }
}

function worker(
  store: NotificationMailStore,
  send: (
    notes: readonly DueNotification[],
  ) => Promise<'sent' | 'failed' | 'suppressed' | null> = () =>
    Promise.resolve('sent'),
  errors: unknown[] = [],
): { deliverDue(): Promise<void>; sent: string[][] } {
  const sent: string[][] = []
  const built = createNotificationWorker({
    store,
    send: (notes) => {
      sent.push(notes.map((note) => note.id))
      return send(notes)
    },
    settings: () => settings,
    now: () => now,
    onError: (error) => errors.push(error),
  })
  return { deliverDue: () => built.deliverDue(), sent }
}

describe('createNotificationWorker', () => {
  it('leaves out what is kept in the app, off, seen or stale (R-NOTE-9)', async () => {
    const { store, calls } = recording([
      due({ id: 'app', cadence: 'in_app' }),
      due({ id: 'seen', seen: true }),
      due({ id: 'mail' }),
    ])
    const run = worker(store)

    await run.deliverDue()

    expect(run.sent).toEqual([['mail']])
    expect(calls.slice(1)).toEqual([
      ['skipped', 'app', 'in_app'],
      ['skipped', 'seen', 'seen'],
      ['mailed', ['mail'], 'immediately'],
    ])
  })

  it('mails each immediate one on its own', async () => {
    const { store } = recording([due({ id: 'a' }), due({ id: 'b' })])
    const run = worker(store)

    await run.deliverDue()

    expect(run.sent).toEqual([['a'], ['b']])
  })

  it('mails every type on one cadence in one mail, when the window allows (R-NOTE-7)', async () => {
    const { store, calls } = recording([
      due({ id: 'request', cadence: 'hourly' }),
      due({ id: 'accepted', type: 'new_connection', cadence: 'hourly' }),
      due({ id: 'other', recipientId: 'm-eve', cadence: 'hourly' }),
    ])
    const run = worker(store)

    await run.deliverDue()

    expect(run.sent).toEqual([['request', 'accepted'], ['other']])
    expect(calls).toContainEqual(['mailed', ['request', 'accepted'], 'hourly'])
  })

  it('holds them until a window after the last mail of that cadence', async () => {
    const { store, calls } = recording(
      [due({ cadence: 'hourly' }), due({ id: 'n2', cadence: 'immediately' })],
      { hourly: new Date('2026-11-08T09:40:00.000Z') },
    )
    const run = worker(store)

    await run.deliverDue()

    expect(run.sent).toEqual([['n2']])
    expect(calls).toContainEqual(['defer', ['n1'], '2026-11-08T10:40:00.000Z'])
  })

  it('holds daily ones until the daily time', async () => {
    const { store, calls } = recording([due({ cadence: 'daily' })])
    const run = worker(store)

    await run.deliverDue()

    expect(run.sent).toEqual([])
    expect(calls).toContainEqual(['defer', ['n1'], '2026-11-09T07:00:00.000Z'])
  })

  it('retries a refused mail for all it carried, and gives up after the last try (R-NOTE-10)', async () => {
    const { store, calls } = recording([
      due({ id: 'a', cadence: 'hourly', attempts: 1 }),
      due({ id: 'b', cadence: 'hourly' }),
      due({ id: 'c', recipientId: 'm-eve', attempts: 4 }),
    ])
    const run = worker(store, () => Promise.resolve('failed'))

    await run.deliverDue()

    expect(calls).toContainEqual([
      'retry',
      ['a', 'b'],
      2,
      '2026-11-08T10:02:00.000Z',
    ])
    expect(calls).toContainEqual(['failed', ['c'], 5])
  })

  it('counts a send that throws as refused, and a suppressed one as mailed', async () => {
    const errors: unknown[] = []
    const { store, calls } = recording([
      due({ id: 'a' }),
      due({ id: 'b', recipientId: 'm-eve' }),
    ])
    const run = worker(
      store,
      (notes) =>
        notes[0]?.id === 'a'
          ? Promise.reject(new Error('connection lost'))
          : Promise.resolve('suppressed'),
      errors,
    )

    await run.deliverDue()

    expect(errors).toHaveLength(1)
    expect(calls).toContainEqual([
      'retry',
      ['a'],
      1,
      '2026-11-08T10:01:00.000Z',
    ])
    expect(calls).toContainEqual(['mailed', ['b'], 'immediately'])
  })

  it('skips those nobody could be sent to, and reports a store that fails', async () => {
    const errors: unknown[] = []
    const { store, calls } = recording([
      due({ id: 'a' }),
      due({ id: 'b', recipientId: 'm-eve' }),
    ])
    store.mailed = (ids, cadence) => {
      if (ids.includes('b'))
        return Promise.reject(new Error('database went away'))
      calls.push(['mailed', ids, cadence])
      return Promise.resolve()
    }
    const run = worker(
      store,
      (notes) => Promise.resolve(notes[0]?.id === 'a' ? null : 'sent'),
      errors,
    )

    await run.deliverDue()

    expect(calls).toContainEqual(['skipped', 'a', 'stale'])
    expect(errors).toHaveLength(1)
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
