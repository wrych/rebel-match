// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchNewNotifications,
  fetchNotifications,
  headline,
  markNotificationsSeen,
  menuLabel,
  NOTIFICATIONS_SEEN,
  type NotificationView,
} from './notifications'

function answer(status: number, body: unknown = {}): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(() =>
    Promise.resolve({
      ok: status < 400,
      status,
      json: () => Promise.resolve(body),
    }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const note = (kind: NotificationView['kind']): NotificationView => ({
  id: 'n1',
  kind,
  at: '2026-10-06T08:00:00.000Z',
  isNew: true,
  name: 'Bea',
  path: '/x',
  trend: kind === 'trend_challenge' ? 'Radical Transparency' : null,
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('headline', () => {
  it.each([
    ['connection_request', 'Bea wants to connect with you'],
    ['connection_accepted', 'Bea accepted your request'],
    ['connection_added', 'Bea connected with you over another challenge'],
    ['applicant', 'Bea asked to join'],
    ['trend_challenge', 'Bea posted a challenge in Radical Transparency'],
  ] as const)('words %s (R-NOTE-5)', (kind, words) => {
    expect(headline(note(kind))).toBe(words)
  })
})

describe('menuLabel', () => {
  it.each([
    [0, 'Notifications'],
    [1, 'Notifications (1 new)'],
    [12, 'Notifications (12 new)'],
  ])('reads %i as %s (R-NOTE-6)', (count, label) => {
    expect(menuLabel(count)).toBe(label)
  })
})

describe('fetchNotifications', () => {
  it('asks for the page after an entry', async () => {
    const fetchMock = answer(200, { notifications: [note('applicant')] })

    expect(await fetchNotifications('n/1')).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/notifications?before=n%2F1')
  })

  it('fails loudly when they cannot be read', async () => {
    answer(500)

    await expect(fetchNotifications()).rejects.toThrow('500')
  })
})

describe('fetchNewNotifications', () => {
  it.each([
    [200, { count: 4 }, 4],
    [200, { count: -1 }, 0],
    [200, { count: 'many' }, 0],
    [401, {}, 0],
  ])('reads %i %o as %i', async (status, body, count) => {
    answer(status, body)

    expect(await fetchNewNotifications()).toBe(count)
  })
})

describe('markNotificationsSeen', () => {
  it('sends the ids and tells the menu (R-NOTE-6)', async () => {
    const fetchMock = answer(204)
    const heard = vi.fn()
    window.addEventListener(NOTIFICATIONS_SEEN, heard)

    await markNotificationsSeen(['n1', 'n2'])

    window.removeEventListener(NOTIFICATIONS_SEEN, heard)
    expect(fetchMock).toHaveBeenCalledWith('/api/notifications/seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ['n1', 'n2'] }),
    })
    expect(heard).toHaveBeenCalledOnce()
  })

  it('asks nothing when nothing was new', async () => {
    const fetchMock = answer(204)

    await markNotificationsSeen([])

    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('the notification settings words', () => {
  it('names each type and marks the default option (R-NOTE-3)', async () => {
    const { typeLabel, cadenceLabel } = await import('./notifications')

    expect(typeLabel('new_connection')).toBe('New connections')
    expect(cadenceLabel('in_app', 'hourly')).toBe('In the app only')
    expect(cadenceLabel('hourly', 'hourly')).toBe('Hourly (default)')
  })
})
