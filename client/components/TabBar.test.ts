// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TabBar from './TabBar.vue'

const route = {
  path: '/matches',
  fullPath: '/matches',
  name: 'cockpit' as string,
  meta: { access: 'onboarded' } as Record<string, unknown>,
}
vi.mock('vue-router', () => ({ useRoute: () => route }))

function serve(pendingIncoming: number | null): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue(
    pendingIncoming === null
      ? { ok: false, status: 500 }
      : {
          ok: true,
          status: 200,
          json: async () => ({
            challenges: [],
            following: [],
            pendingIncoming,
          }),
        },
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountBar(): Promise<ReturnType<typeof mount>> {
  const bar = mount(TabBar, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return bar
}

afterEach(() => {
  vi.unstubAllGlobals()
  route.name = 'cockpit'
  route.meta = { access: 'onboarded' }
})

describe('TabBar', () => {
  it('badges Matches with the requests waiting (R-MINE-4)', async () => {
    serve(2)
    const bar = await mountBar()
    const matches = bar.findAllComponents(RouterLinkStub)[1]

    expect(matches?.find('.badge').text()).toBe('2')
    expect(matches?.attributes('aria-label')).toBe(
      'Matches, 2 requests waiting',
    )
    expect(matches?.attributes('aria-current')).toBe('page')
  })

  it('shows no badge when nothing waits, or the count cannot be read', async () => {
    serve(0)
    expect((await mountBar()).find('.badge').exists()).toBe(false)

    serve(null)
    expect((await mountBar()).find('.badge').exists()).toBe(false)
  })

  it('stays away from the welcome screen and asks nothing there', async () => {
    const fetchMock = serve(1)
    route.name = 'welcome'

    expect((await mountBar()).find('nav').exists()).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('stays away from screens before onboarding', async () => {
    serve(1)
    route.meta = { access: 'session' }
    route.name = 'onboarding'

    expect((await mountBar()).find('nav').exists()).toBe(false)
  })
})
