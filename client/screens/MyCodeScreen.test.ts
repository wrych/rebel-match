// @vitest-environment jsdom
import {
  enableAutoUnmount,
  flushPromises,
  mount,
  RouterLinkStub,
} from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { forgetMe } from '../lib/session'
import MyCodeScreen from './MyCodeScreen.vue'

const route = reactive({
  path: '/me/code',
  query: {} as Record<string, string>,
})
const replace = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ replace }),
}))
const shareImage = vi.fn((_file: File, _text: string) =>
  Promise.resolve('share_sheet'),
)
const renderCodeCard = vi.fn((_card: unknown) =>
  Promise.resolve(new File(['png'], 'code.png')),
)
vi.mock('../lib/share-sheet', () => ({
  shareImage: (file: File, text: string) => shareImage(file, text),
}))
vi.mock('../lib/code-card', () => ({
  renderCodeCard: (card: unknown) => renderCodeCard(card),
}))

function server(code: unknown, connectCodes = 1): ReturnType<typeof vi.fn> {
  const bodies: Record<string, unknown> = {
    '/api/config': {
      limits: { savedTickMs: 1500, connectCodes, liveCodeSeconds: 30 },
    },
    '/auth/me': { id: 'm1', name: 'Ada Lovelace', permissions: [] },
    '/api/me/profile-code': code,
    '/api/me/live-codes': {
      token: 'live-1',
      showForSeconds: 30,
      usableUntil: '2026-11-08T10:00:40.000Z',
      connected: [],
    },
  }
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve(
      bodies[url] === null
        ? { ok: false, status: 404 }
        : { ok: true, status: 200, json: async () => bodies[url] },
    ),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(MyCodeScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return screen
}

const asked = (fetchMock: ReturnType<typeof vi.fn>): string[] =>
  fetchMock.mock.calls.map(([url]) => String(url))

enableAutoUnmount(afterEach)

afterEach(() => {
  vi.unstubAllGlobals()
  replace.mockReset()
  renderCodeCard.mockClear()
  shareImage.mockClear()
  forgetMe()
  route.query = {}
})

describe('MyCodeScreen (S47, R-CODE-1, R-CODE-2)', () => {
  it('draws its tabs as a row of buttons, not as the bottom bar (R-LOOK-4)', async () => {
    server({ token: 'tok-1', enabled: true })
    const screen = await mountScreen()

    const tablist = screen.find('[role="tablist"]')
    expect(tablist.classes()).toContain('screen-tabs')
    expect(tablist.classes()).not.toContain('tabs')
  })

  it('shows the profile code as a QR of its link, with the member’s name and no controls (R-CODE-4)', async () => {
    route.query = { tab: 'profile' }
    server({ token: 'tok-1', enabled: true })
    const screen = await mountScreen()

    expect(screen.find('svg[role=img]').attributes('aria-label')).toBe(
      'Profile code of Ada Lovelace',
    )
    expect(screen.text()).toContain('Ada Lovelace')
    expect(screen.find('button[aria-label="Copy link"]').exists()).toBe(true)
    expect(screen.text()).not.toContain('Profile code: on')
    expect(screen.text()).not.toContain('Reset code')
  })

  it('says the code is off, with the way to turn it on (R-CODE-4)', async () => {
    route.query = { tab: 'profile' }
    server({ token: 'tok-1', enabled: false })
    const screen = await mountScreen()

    expect(screen.text()).toContain('Your code is off')
    expect(
      screen.findAllComponents(RouterLinkStub).map((link) => link.props('to')),
    ).toContain('/profile')
  })

  it('opens on Connect now: the live code with the member’s name, no Copy or Share, and no profile code made (R-CODE-5)', async () => {
    const fetchMock = server({ token: 'tok-1', enabled: true })
    const screen = await mountScreen()

    expect(screen.find('svg[aria-label="Live connect code"]').exists()).toBe(
      true,
    )
    expect(screen.find('.code-card').text()).toContain('Ada Lovelace')
    expect(screen.find('button[aria-label="Copy link"]').exists()).toBe(false)
    expect(
      screen.findAll('button').map((button) => button.text()),
    ).not.toContain('Share')
    expect(asked(fetchMock)).not.toContain('/api/me/profile-code')
  })

  it('switches tabs through the address', async () => {
    server({ token: 'tok-1', enabled: true })
    const screen = await mountScreen()
    const profile = screen
      .findAll('[role=tab]')
      .find((each) => each.text() === 'Share my profile')
    await profile?.trigger('click')

    expect(replace).toHaveBeenCalledWith({ query: { tab: 'profile' } })
  })

  it('draws the card ahead, so Share hands it over in the tap (R-CODE-2)', async () => {
    route.query = { tab: 'profile' }
    server({ token: 'tok-1', enabled: true })
    const screen = await mountScreen()
    const renderedBeforeTap = renderCodeCard.mock.calls.length
    const share = screen
      .findAll('button')
      .find((each) => each.text() === 'Share')
    await share?.trigger('click')
    await flushPromises()

    expect(renderedBeforeTap).toBe(1)
    expect(renderCodeCard).toHaveBeenCalledTimes(1)
    expect(renderCodeCard).toHaveBeenCalledWith({
      name: 'Ada Lovelace',
      link: `${window.location.origin}/p#t=tok-1`,
      site: window.location.origin,
    })
    expect(shareImage.mock.calls[0]?.[1]).toContain('/p#t=tok-1')
  })

  it('offers no Share while the profile code is off (R-CODE-4)', async () => {
    route.query = { tab: 'profile' }
    server({ token: 'tok-1', enabled: false })
    const screen = await mountScreen()
    const share = screen
      .findAll('button')
      .find((each) => each.text() === 'Share')

    expect(share?.attributes('disabled')).toBeDefined()
  })

  it('says so when the card cannot be drawn, Copy link still there', async () => {
    route.query = { tab: 'profile' }
    renderCodeCard.mockRejectedValueOnce(new Error('no canvas'))
    server({ token: 'tok-1', enabled: true })
    const screen = await mountScreen()

    expect(screen.find('[role=alert]').text()).toContain(
      'The card could not be drawn',
    )
    expect(screen.find('button[aria-label="Copy link"]').exists()).toBe(true)
  })

  it('says so when sharing fails', async () => {
    route.query = { tab: 'profile' }
    shareImage.mockRejectedValueOnce(new Error('denied'))
    server({ token: 'tok-1', enabled: true })
    const screen = await mountScreen()
    await screen
      .findAll('button')
      .find((each) => each.text() === 'Share')
      ?.trigger('click')
    await flushPromises()

    expect(screen.find('[role=alert]').text()).toContain(
      'The card could not be shared',
    )
  })

  it('is not found while hosts have codes off, asking for no code (R-CODE-1)', async () => {
    const fetchMock = server(null, 0)
    await mountScreen()

    expect(replace).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'not-found' }),
    )
    expect(asked(fetchMock)).not.toContain('/api/me/profile-code')
    expect(asked(fetchMock)).not.toContain('/api/me/live-codes')
  })
})
