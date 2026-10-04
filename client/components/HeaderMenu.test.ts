// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

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

    expect(paths(await opened())).toEqual([
      '/admin/applicants',
      '/admin/outbox',
    ])
  })

  it('offers no host tools to a member without their permissions', async () => {
    signedIn([])
    const menu = await opened()

    expect(paths(menu)).toEqual([])
    expect(menu.text()).not.toContain('Host tools')
  })

  it('offers only the colour mode to nobody signed in', async () => {
    signedIn(null)
    const menu = await opened()

    expect(menu.find('[role="switch"]').exists()).toBe(true)
    expect(menu.text()).not.toContain('Sign out')
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
})
