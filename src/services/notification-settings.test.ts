import { describe, expect, it } from 'vitest'
import type { Cadence, ChoosableType } from './notification-cadence.js'
import {
  createNotificationSettings,
  type NotificationSettingsStore,
} from './notification-settings.js'

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
  it('lists each type a member can receive, at its default until chosen', async () => {
    const { store } = fakeStore()
    const settings = createNotificationSettings(store)

    const member = await settings.list('m-ada', false)
    const host = await settings.list('m-host', true)

    expect(member.map((s) => [s.type, s.cadence])).toEqual([
      ['connection_request', 'hourly'],
      ['new_connection', 'hourly'],
    ])
    expect(host.map((s) => [s.type, s.cadence])).toEqual([
      ['connection_request', 'hourly'],
      ['new_connection', 'hourly'],
      ['applicant', 'every_15_minutes'],
    ])
    expect(host[2]?.offered).toContain('every_15_minutes')
    expect(member[0]?.offered).not.toContain('every_15_minutes')
  })

  it('records a choice, and forgets it when the default is chosen again', async () => {
    const { store, rows } = fakeStore()
    const settings = createNotificationSettings(store)

    expect(
      await settings.choose('m-ada', false, 'connection_request', 'daily'),
    ).toBe('done')
    expect(rows.get('m-ada:connection_request')).toBe('daily')
    expect((await settings.list('m-ada', false))[0]?.cadence).toBe('daily')

    await settings.choose('m-ada', false, 'connection_request', 'hourly')
    expect(rows.has('m-ada:connection_request')).toBe(false)
  })

  it('applies a choice to what is still waiting (R-NOTE-3)', async () => {
    const { store, released } = fakeStore()
    const settings = createNotificationSettings(store)

    await settings.choose('m-ada', false, 'connection_request', 'immediately')

    expect(released).toEqual(['m-ada:connection_request'])
  })

  it('hides what was not seen yet when a type is set to off', async () => {
    const { store, hidden } = fakeStore()
    const settings = createNotificationSettings(store)

    await settings.choose('m-ada', false, 'new_connection', 'off')

    expect(hidden).toEqual(['m-ada:new_connection'])
  })

  it('refuses a type the member cannot receive, and an option it does not offer', async () => {
    const { store, rows } = fakeStore()
    const settings = createNotificationSettings(store)

    expect(await settings.choose('m-ada', false, 'applicant', 'daily')).toBe(
      'not_found',
    )
    expect(
      await settings.choose('m-ada', false, 'trend_challenge', 'daily'),
    ).toBe('not_found')
    expect(
      await settings.choose(
        'm-ada',
        false,
        'connection_request',
        'every_15_minutes',
      ),
    ).toBe('not_offered')
    expect(await settings.choose('m-host', true, 'applicant', 'weekly')).toBe(
      'not_offered',
    )
    expect(rows.size).toBe(0)
  })
})
