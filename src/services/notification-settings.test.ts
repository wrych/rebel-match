import { describe, expect, it } from 'vitest'
import type { AnalyticsEvent } from './analytics.js'
import type { Cadence, ChoosableType } from './notification-cadence.js'
import {
  createNotificationSettings,
  type NotificationSettingsStore,
} from './notification-settings.js'

const HOST = ['applicant:review', 'report:review'] as const

function fakeStore(): {
  store: NotificationSettingsStore
  rows: Map<string, Cadence>
  hidden: string[]
  released: string[]
} {
  const rows = new Map<string, Cadence>()
  const hidden: string[] = []
  const released: string[] = []
  const store: NotificationSettingsStore = {
    chosen: (memberId) =>
      Promise.resolve(
        Object.fromEntries(
          [...rows]
            .filter(([key]) => key.startsWith(`${memberId}:`))
            .map(([key, cadence]) => [key.split(':')[1], cadence]),
        ) as Partial<Record<ChoosableType, Cadence>>,
      ),
    choose: (memberId, type, cadence) => {
      if (cadence === null) rows.delete(`${memberId}:${type}`)
      else rows.set(`${memberId}:${type}`, cadence)
      return Promise.resolve()
    },
    hideUnseen: (memberId, type) => {
      hidden.push(`${memberId}:${type}`)
      return Promise.resolve()
    },
    releaseWaiting: (memberId, type) => {
      released.push(`${memberId}:${type}`)
      return Promise.resolve()
    },
  }
  return { store, rows, hidden, released }
}

describe('createNotificationSettings (R-NOTE-2, R-NOTE-3)', () => {
  it('lists each type a member can receive, a host’s notices by permission, at its default until chosen (R-MOD-5)', async () => {
    const { store } = fakeStore()
    const settings = createNotificationSettings(store)

    const member = await settings.list('m-ada', [])
    const host = await settings.list('m-host', HOST)

    expect(member.map((s) => [s.type, s.cadence])).toEqual([
      ['connection_request', 'hourly'],
      ['new_connection', 'hourly'],
      ['trend_challenge', 'daily'],
      ['badge', 'daily'],
      ['recap', 'immediately'],
    ])
    expect(host.map((s) => [s.type, s.cadence])).toEqual([
      ['connection_request', 'hourly'],
      ['new_connection', 'hourly'],
      ['trend_challenge', 'daily'],
      ['badge', 'daily'],
      ['recap', 'immediately'],
      ['applicant', 'every_15_minutes'],
      ['report', 'hourly'],
    ])
    expect(host[5]?.offered).toContain('every_15_minutes')
    expect(member[0]?.offered).not.toContain('every_15_minutes')
    expect(host[6]?.offered).not.toContain('every_15_minutes')
  })

  it('records a choice, and forgets it when the default is chosen again', async () => {
    const { store, rows } = fakeStore()
    const settings = createNotificationSettings(store)

    expect(
      await settings.choose('m-ada', [], 'connection_request', 'daily'),
    ).toBe('done')
    expect(rows.get('m-ada:connection_request')).toBe('daily')
    expect((await settings.list('m-ada', []))[0]?.cadence).toBe('daily')

    await settings.choose('m-ada', [], 'connection_request', 'hourly')
    expect(rows.has('m-ada:connection_request')).toBe(false)
  })

  it('applies a choice to what is still waiting (R-NOTE-3)', async () => {
    const { store, released } = fakeStore()
    const settings = createNotificationSettings(store)

    await settings.choose('m-ada', [], 'connection_request', 'immediately')

    expect(released).toEqual(['m-ada:connection_request'])
  })

  it('reports a change of cadence, not a choice that changes nothing (R-ANA-1)', async () => {
    const { store } = fakeStore()
    const tracked: [string, AnalyticsEvent][] = []
    const settings = createNotificationSettings(store, (memberId, event) => {
      tracked.push([memberId, event])
      return Promise.resolve()
    })

    await settings.choose('m-ada', [], 'connection_request', 'hourly')
    await settings.choose('m-ada', [], 'connection_request', 'off')
    await settings.choose('m-ada', [], 'connection_request', 'off')
    await settings.choose('m-ada', [], 'applicant', 'daily')

    expect(tracked).toEqual([
      [
        'm-ada',
        {
          name: 'notification_cadence_changed',
          type: 'connection_request',
          from: 'hourly',
          to: 'off',
        },
      ],
    ])
  })

  it('hides what was not seen yet when a type is set to off', async () => {
    const { store, hidden } = fakeStore()
    const settings = createNotificationSettings(store)

    await settings.choose('m-ada', [], 'new_connection', 'off')

    expect(hidden).toEqual(['m-ada:new_connection'])
  })

  it('refuses a type the member cannot receive, and an option it does not offer', async () => {
    const { store, rows } = fakeStore()
    const settings = createNotificationSettings(store)

    expect(await settings.choose('m-ada', [], 'applicant', 'daily')).toBe(
      'not_found',
    )
    expect(await settings.choose('m-ada', [], 'weekly_news', 'daily')).toBe(
      'not_found',
    )
    expect(
      await settings.choose(
        'm-ada',
        [],
        'connection_request',
        'every_15_minutes',
      ),
    ).toBe('not_offered')
    expect(await settings.choose('m-host', HOST, 'applicant', 'weekly')).toBe(
      'not_offered',
    )
    expect(rows.size).toBe(0)
  })
})
