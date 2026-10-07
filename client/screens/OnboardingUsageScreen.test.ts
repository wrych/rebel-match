// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  analyticsWordsOf,
  latestAnalyticsVersion,
} from '../../src/analytics-consent'
import OnboardingUsageScreen from './OnboardingUsageScreen.vue'

const push = vi.fn()
const route = { query: {} as Record<string, string> }
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => route,
}))

function server(status = 204): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
    init?.method === 'PUT'
      ? Promise.resolve({ ok: status < 300, status })
      : Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ analyticsVersion: latestAnalyticsVersion }),
        }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(OnboardingUsageScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return screen
}

function puts(fetchMock: ReturnType<typeof vi.fn>): unknown[] {
  return fetchMock.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === 'PUT')
    .map(([, init]) => JSON.parse((init as RequestInit).body as string))
}

function button(
  screen: ReturnType<typeof mount>,
  label: string,
): ReturnType<ReturnType<typeof mount>['find']> {
  const found = screen.findAll('button').find((b) => b.text() === label)
  if (found === undefined) throw new Error(`no button ${label}`)
  return found
}

afterEach(() => {
  vi.unstubAllGlobals()
  push.mockReset()
  route.query = {}
})

describe('OnboardingUsageScreen', () => {
  it('shows step 3, says the profile is saved and where to edit it (R-ONB-11)', async () => {
    server()
    const screen = await mountScreen()

    expect(screen.find('[aria-current="step"]').text()).toContain('Usage')
    expect(screen.find('.notice-ok').text()).toContain('Profile saved.')
    expect(screen.findComponent(RouterLinkStub).props('to')).toBe('/profile')
  })

  it('shows the analytics words in force (R-ANA-4)', async () => {
    server()
    const text = (await mountScreen()).text()

    for (const paragraph of analyticsWordsOf(latestAnalyticsVersion)) {
      expect(text).toContain(
        typeof paragraph === 'string' ? paragraph : paragraph.text,
      )
    }
  })

  it('offers two buttons of the same look, neither chosen (R-ANA-4)', async () => {
    server()
    const screen = await mountScreen()
    const share = button(screen, 'Share usage data')
    const decline = button(screen, 'No thanks')

    expect(share.classes()).toEqual(decline.classes())
    expect(screen.findAll('input')).toHaveLength(0)
  })

  it('records sharing as from onboarding, then goes where they came for (R-ANA-6)', async () => {
    const fetchMock = server()
    route.query = { next: '/matches' }
    const screen = await mountScreen()
    await button(screen, 'Share usage data').trigger('click')
    await flushPromises()

    expect(puts(fetchMock)).toEqual([
      { optIn: true, version: latestAnalyticsVersion, from: 'onboarding' },
    ])
    expect(push).toHaveBeenCalledWith('/matches')
  })

  it('sends and records nothing for No thanks (R-ANA-4, R-ANA-6)', async () => {
    const fetchMock = server()
    const screen = await mountScreen()
    await button(screen, 'No thanks').trigger('click')
    await flushPromises()

    expect(puts(fetchMock)).toEqual([])
    expect(push).toHaveBeenCalledWith('/welcome')
  })

  it('stays when the words changed, saying so', async () => {
    server(409)
    const screen = await mountScreen()
    await button(screen, 'Share usage data').trigger('click')
    await flushPromises()

    expect(screen.find('[role="alert"]').text()).toContain(
      'The wording has just changed',
    )
    expect(push).not.toHaveBeenCalled()
  })

  it('says a failed save failed', async () => {
    server(500)
    const screen = await mountScreen()
    await button(screen, 'Share usage data').trigger('click')
    await flushPromises()

    expect(screen.find('[role="alert"]').text()).toBe(
      'That did not save. Try again.',
    )
  })
})
