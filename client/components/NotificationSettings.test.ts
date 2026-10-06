// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import NotificationSettings from './NotificationSettings.vue'

const settings = [
  {
    type: 'connection_request',
    cadence: 'hourly',
    defaultCadence: 'hourly',
    offered: ['immediately', 'hourly', 'daily', 'in_app', 'off'],
  },
  {
    type: 'applicant',
    cadence: 'every_15_minutes',
    defaultCadence: 'every_15_minutes',
    offered: [
      'immediately',
      'every_15_minutes',
      'hourly',
      'daily',
      'in_app',
      'off',
    ],
  },
]

function serve(saveStatus = 204): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/config')
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ limits: { savedTickMs: 2500 } }),
      })
    if (init?.method === 'PUT')
      return Promise.resolve({ ok: saveStatus < 400, status: saveStatus })
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ settings: structuredClone(settings) }),
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountSettings(): Promise<ReturnType<typeof mount>> {
  const wrapper = mount(NotificationSettings)
  await flushPromises()
  return wrapper
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('NotificationSettings (R-NOTE-2, R-NOTE-3)', () => {
  it('offers each type its own options, marking the default', async () => {
    serve()
    const wrapper = await mountSettings()

    expect(wrapper.find('label[for="notify-connection_request"]').text()).toBe(
      'Requests to connect',
    )
    const request = wrapper.find('#notify-connection_request')
    expect((request.element as HTMLSelectElement).value).toBe('hourly')
    expect(request.findAll('option').map((o) => o.text())).toEqual([
      'Immediately',
      'Hourly (default)',
      'Daily',
      'In the app only',
      'Off',
    ])
    expect(
      wrapper
        .find('#notify-applicant')
        .findAll('option')
        .map((o) => o.text()),
    ).toContain('Every 15 minutes (default)')
  })

  it('saves on change and shows the tick (R-PROF-1)', async () => {
    const fetchMock = serve()
    const wrapper = await mountSettings()

    await wrapper.find('#notify-connection_request').setValue('daily')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/me/notification-settings/connection_request',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cadence: 'daily' }),
      },
    )
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('goes back to what was saved, and says so, when the save fails', async () => {
    serve(500)
    const wrapper = await mountSettings()
    const select = wrapper.find('#notify-connection_request')

    await select.setValue('off')
    await flushPromises()

    expect((select.element as HTMLSelectElement).value).toBe('hourly')
    expect(wrapper.find('[role="alert"]').text()).toContain('did not save')
  })

  it('says so when the settings cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 500 })),
    )
    const wrapper = await mountSettings()

    expect(wrapper.find('[role="alert"]').text()).toContain(
      'could not be loaded',
    )
  })
})
