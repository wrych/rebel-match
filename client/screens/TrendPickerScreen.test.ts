// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Trend } from '../lib/challenges'
import TrendPickerScreen from './TrendPickerScreen.vue'

const route = {
  params: { id: 'c1' },
  query: { current: '02' } as Record<string, string>,
}
vi.mock('vue-router', () => ({ useRoute: () => route }))

const trends: Trend[] = [
  { id: '01', short: 'Purpose & Values', from: 'Profit', peers: 12 },
  { id: '02', short: 'Network of Teams', from: 'Pyramid', peers: 34 },
]

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(TrendPickerScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return screen
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TrendPickerScreen', () => {
  it('offers every trend, each leading back to the domain screen (R-ASK-6)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ trends }),
      }),
    )
    const links = (await mountScreen()).findAllComponents(RouterLinkStub)

    expect(links.map((link) => link.props('to'))).toEqual([
      '/challenges/c1?trend=01',
      '/challenges/c1?trend=02',
    ])
    expect(links[0]?.text()).toContain('12 rebels')
    expect(links[1]?.text()).toContain('Your challenge')
    expect(links[1]?.attributes('aria-current')).toBe('true')
  })

  it('says so when the trends cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    )
    const screen = await mountScreen()

    expect(screen.find('[role="alert"]').text()).toContain(
      'could not be loaded',
    )
  })
})
