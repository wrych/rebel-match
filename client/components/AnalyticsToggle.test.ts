// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { latestAnalyticsVersion } from '../../src/analytics-consent'
import AnalyticsToggle from './AnalyticsToggle.vue'

/** Serves the config, and answers the PUT with `status`. */
function server(status = 204): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
    Promise.resolve(
      init?.method === 'PUT'
        ? { ok: status < 300, status }
        : {
            ok: true,
            status: 200,
            json: async () => ({ analyticsVersion: latestAnalyticsVersion }),
          },
    ),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountToggle(
  optedIn: boolean,
): Promise<ReturnType<typeof mount>> {
  const toggle = mount(AnalyticsToggle, { props: { optedIn } })
  await flushPromises()
  return toggle
}

function box(toggle: ReturnType<typeof mount>): HTMLInputElement {
  return toggle.find('input[type="checkbox"]').element as HTMLInputElement
}

function putBody(fetchMock: ReturnType<typeof vi.fn>): unknown {
  const [, init] = fetchMock.mock.calls.find(
    ([, options]) => (options as RequestInit | undefined)?.method === 'PUT',
  ) as [string, RequestInit]
  return JSON.parse(String(init.body))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AnalyticsToggle', () => {
  it('shows the member’s current choice', async () => {
    server()

    expect(box(await mountToggle(true)).checked).toBe(true)
    expect(box(await mountToggle(false)).checked).toBe(false)
  })

  it('opts in against the words in force (R-ANA-4)', async () => {
    const fetchMock = server()
    const toggle = await mountToggle(false)

    await toggle.find('input[type="checkbox"]').setValue(true)
    await flushPromises()

    expect(putBody(fetchMock)).toEqual({
      optIn: true,
      version: latestAnalyticsVersion,
    })
    expect(toggle.find('[role="status"]').text()).toContain('now count')
  })

  it('withdraws as easily as it was given (R-ANA-4)', async () => {
    const fetchMock = server()
    const toggle = await mountToggle(true)

    await toggle.find('input[type="checkbox"]').setValue(false)
    await flushPromises()

    expect(putBody(fetchMock)).toEqual({ optIn: false })
    expect(toggle.find('[role="status"]').text()).toContain('nothing about you')
  })

  it('puts the box back and says so when saving fails', async () => {
    server(500)
    const toggle = await mountToggle(false)

    await toggle.find('input[type="checkbox"]').setValue(true)
    await flushPromises()

    expect(box(toggle).checked).toBe(false)
    expect(toggle.find('[role="alert"]').text()).toContain('did not save')
  })

  it('puts the box back when the words changed', async () => {
    server(409)
    const toggle = await mountToggle(false)

    await toggle.find('input[type="checkbox"]').setValue(true)
    await flushPromises()

    expect(box(toggle).checked).toBe(false)
    expect(toggle.find('[role="alert"]').text()).toContain('wording')
  })
})
