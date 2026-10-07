// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('vue-router', () => ({ useRoute: () => ({ name: 'offer' }) }))

/** Answers /auth/me as this member, or 401 for nobody signed in. */
function signedIn(permissions: string[] | null): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve(
      url === '/auth/me' && permissions !== null
        ? {
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                id: 'a',
                name: 'Ada',
                onboarded: true,
                analyticsOptIn: false,
                roles: [],
                permissions,
              }),
          }
        : {
            ok: url === '/auth/logout',
            status: url === '/auth/me' ? 401 : 204,
          },
    ),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** Also answers /api/config, naming where feedback goes. */
function withConfig(
  signedInAs: ReturnType<typeof vi.fn>,
): ReturnType<typeof vi.fn> {
  const answer = signedInAs as unknown as (url: string) => Promise<unknown>
  const fetchMock = vi.fn((url: string) =>
    url === '/api/config'
      ? Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              build: { commit: 'dev', url: null },
              feedbackTo: 'owner@example.org',
              limits: { matchesPollSeconds: 30 },
            }),
        })
      : answer(url),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountMenu(
  mood: 'calm' | 'happy' = 'calm',
): Promise<ReturnType<typeof mount>> {
  vi.resetModules()
  const { default: HeaderMenu } = await import('./HeaderMenu.vue')
  const menu = mount(HeaderMenu, {
    props: { mood },
    attachTo: document.body,
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  return menu
}

async function opened(
  mood: 'calm' | 'happy' = 'calm',
): Promise<ReturnType<typeof mount>> {
  const menu = await mountMenu(mood)
  await menu.find('button[aria-label="Menu"]').trigger('click')
  await flushPromises()
  return menu
}

function paths(menu: ReturnType<typeof mount>): unknown[] {
  return menu
    .findAllComponents(RouterLinkStub)
    .map((link) => link.props('to') as unknown)
}

function hostPaths(menu: ReturnType<typeof mount>): unknown[] {
  return paths(menu).filter((to) => String(to).startsWith('/admin/'))
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('HeaderMenu', () => {
  it('starts closed, and says so', async () => {
    signedIn([])
    const menu = await mountMenu()

    expect(menu.find('#main-menu').exists()).toBe(false)
    expect(
      menu.find('button[aria-label="Menu"]').attributes('aria-expanded'),
    ).toBe('false')
  })

  it('switches the colour mode, showing which is on (R-LOOK-2)', async () => {
    signedIn([])
    const menu = await opened('happy')
    const mode = menu.find('[role="switch"]')

    expect(mode.attributes('aria-checked')).toBe('true')
    await mode.trigger('click')
    expect(menu.emitted('toggleMood')).toHaveLength(1)
  })

  it('offers each host tool by the permission it needs (R-ROLE-4)', async () => {
    signedIn(['applicant:review', 'outbox:read'])

    expect(hostPaths(await opened())).toEqual([
      '/admin/applicants',
      '/admin/outbox',
    ])
  })

  it('offers no host tools to a member without their permissions', async () => {
    signedIn([])
    const menu = await opened()

    expect(hostPaths(menu)).toEqual([])
    expect(menu.text()).not.toContain('Host tools')
  })

  it('leads an onboarded member to Profile & privacy (R-PROF-3)', async () => {
    signedIn([])

    expect(paths(await opened())).toContain('/profile')
  })

  it('offers the colour mode and the impressum to nobody signed in (R-PROF-4)', async () => {
    signedIn(null)
    const menu = await opened()

    expect(menu.find('[role="switch"]').exists()).toBe(true)
    expect(menu.text()).not.toContain('Sign out')
    expect(paths(menu)).toEqual(['/impressum'])
  })

  it('leads a member to the impressum (R-PROF-4)', async () => {
    signedIn([])

    expect(paths(await opened())).toContain('/impressum')
  })

  it('signs out on the server, then goes to the login screen', async () => {
    const fetchMock = signedIn([])
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    const menu = await opened()

    const out = menu.findAll('button').find((b) => b.text() === 'Sign out')
    await out?.trigger('click')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith('/auth/logout', { method: 'POST' })
    expect(assign).toHaveBeenCalledWith('/login')
  })

  it('stays, and says so, when signing out fails', async () => {
    signedIn([])
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    const menu = await opened()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    )

    const out = menu.findAll('button').find((b) => b.text() === 'Sign out')
    await out?.trigger('click')
    await flushPromises()

    expect(assign).not.toHaveBeenCalled()
    expect(menu.find('[role="alert"]').text()).toContain('still signed in')
  })

  it('asks who is signed in afresh on each opening', async () => {
    const fetchMock = signedIn([])
    const menu = await opened()
    await menu.find('button[aria-label="Menu"]').trigger('click')

    await menu.find('button[aria-label="Menu"]').trigger('click')
    await flushPromises()

    expect(
      fetchMock.mock.calls.filter(([url]) => url === '/auth/me'),
    ).toHaveLength(2)
  })

  it('closes on Escape and hands focus back to its button', async () => {
    signedIn([])
    const menu = await opened()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()

    expect(menu.find('#main-menu').exists()).toBe(false)
    expect(document.activeElement).toBe(
      menu.find('button[aria-label="Menu"]').element,
    )
  })

  it('closes on a click outside it', async () => {
    signedIn([])
    const menu = await opened()

    document.body.click()
    await flushPromises()

    expect(menu.find('#main-menu').exists()).toBe(false)
  })

  it.each([
    [
      { commit: '110a584', url: 'https://github.com/o/r/commit/110a584f' },
      'https://github.com/o/r/commit/110a584f',
    ],
    [{ commit: 'dev', url: null }, null],
  ])(
    'shows the running version %o at its foot (R-NFR-11)',
    async (build, href) => {
      const me = signedIn([]) as unknown as (url: string) => Promise<unknown>
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) =>
          url === '/api/config'
            ? Promise.resolve({
                ok: true,
                status: 200,
                json: () =>
                  Promise.resolve({
                    build,
                    limits: { matchesPollSeconds: 30 },
                  }),
              })
            : me(url),
        ),
      )
      const menu = await opened()

      const line = menu.find('.version')
      expect(line.text()).toBe(`Version ${build.commit}`)
      expect(
        line.find('a').exists() ? line.find('a').attributes('href') : null,
      ).toBe(href)
    },
  )

  it('shows no version when the config cannot be read', async () => {
    signedIn([])
    const menu = await opened()

    expect(menu.find('.version').exists()).toBe(false)
  })

  it('badges the menu and names the count while notifications are new (R-NOTE-6)', async () => {
    const me = signedIn([]) as unknown as (url: string) => Promise<unknown>
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url === '/api/notifications/new'
          ? Promise.resolve({
              ok: true,
              status: 200,
              json: () => Promise.resolve({ count: 3 }),
            })
          : me(url),
      ),
    )
    const menu = await opened()

    expect(menu.find('.menu-badge').text()).toBe('3')
    expect(menu.find('button.cap').attributes('aria-label')).toBe(
      'Menu, 3 new notifications',
    )
    const item = menu
      .findAllComponents(RouterLinkStub)
      .find((link) => link.props('to') === '/notifications')
    expect(item?.text()).toBe('Notifications (3 new)')
  })

  it('shows no badge and no number with nothing new (R-NOTE-6)', async () => {
    signedIn([])
    const menu = await opened()

    expect(menu.find('.menu-badge').exists()).toBe(false)
    const item = menu
      .findAllComponents(RouterLinkStub)
      .find((link) => link.props('to') === '/notifications')
    expect(item?.text()).toBe('Notifications')
  })

  it('reads the count again once the notifications screen marked them', async () => {
    let count = 2
    const me = signedIn([]) as unknown as (url: string) => Promise<unknown>
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url === '/api/notifications/new'
          ? Promise.resolve({
              ok: true,
              status: 200,
              json: () => Promise.resolve({ count }),
            })
          : me(url),
      ),
    )
    const menu = await opened()
    expect(menu.find('.menu-badge').text()).toBe('2')

    count = 0
    window.dispatchEvent(new Event('notifications-seen'))
    await flushPromises()

    expect(menu.find('.menu-badge').exists()).toBe(false)
  })

  it('offers an onboarded member a Feedback mail naming the screen (R-FB-1)', async () => {
    withConfig(signedIn([]))
    const menu = await opened()
    const link = menu.find('a.item-feedback')
    const url = new URL(link.attributes('href') ?? '')

    expect(link.text()).toBe('Feedback')
    expect(url.pathname).toBe('owner@example.org')
    expect(url.searchParams.get('body')).toContain('Screen: offer')
  })

  it('reports the feedback opened, by screen name only, and closes (R-ANA-1, ADR 0026)', async () => {
    const fetchMock = withConfig(signedIn([]))
    const menu = await opened()

    await menu.find('a.item-feedback').trigger('click')

    const [, init] = fetchMock.mock.calls.find(
      ([url]) => url === '/api/events',
    ) as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      event: 'feedback_opened',
      props: { screen: 'offer' },
    })
    expect(menu.find('#main-menu').exists()).toBe(false)
  })

  it('offers no Feedback to nobody signed in', async () => {
    withConfig(signedIn(null))

    expect((await opened()).find('a.item-feedback').exists()).toBe(false)
  })
})
