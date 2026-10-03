// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TrendScreen from './TrendScreen.vue'

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { trendId: '06' } }),
}))

const detail = {
  trend: {
    id: '06',
    short: 'Distributed Decision Making',
    from: 'Centralized Authority',
    peers: 29,
  },
  cases: [
    {
      org: 'Haier',
      url: 'https://example.invalid/haier',
      takeaway: 'Micro-enterprises.',
    },
  ],
}

function serve(found: object | null, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url === '/api/follows')
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ trends: [] }),
        })
      if (found === null) return Promise.resolve({ ok: false, status })
      return Promise.resolve({ ok: true, status: 200, json: async () => found })
    }),
  )
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(TrendScreen)
  await flushPromises()
  return screen
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TrendScreen', () => {
  it('shows the trend, what it moves from, and its peers (design S9)', async () => {
    serve(detail)
    const screen = await mountScreen()

    expect(screen.find('h1').text()).toBe('Distributed Decision Making')
    expect(screen.text()).toContain(
      'Centralized Authority → Distributed Decision Making',
    )
    expect(screen.text()).toContain('29 rebels work on this trend')
  })

  it('lists the case studies, opening in a new tab', async () => {
    serve(detail)
    const link = (await mountScreen()).find('a.case')

    expect(link.attributes('href')).toBe('https://example.invalid/haier')
    expect(link.attributes('rel')).toContain('noopener')
  })

  it('offers to follow the trend (R-ASK-9)', async () => {
    serve(detail)

    expect((await mountScreen()).find('button[aria-pressed]').text()).toContain(
      'Follow “Distributed Decision Making”',
    )
  })

  it('says so for an id that is no trend', async () => {
    serve(null, 404)

    expect((await mountScreen()).find('.empty').text()).toContain(
      'no such trend',
    )
  })

  it('says so when the trend cannot be loaded', async () => {
    serve(null, 500)

    expect((await mountScreen()).find('[role="alert"]').text()).toContain(
      'could not be loaded',
    )
  })
})
