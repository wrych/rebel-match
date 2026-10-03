// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

function signedIn(permissions: string[]): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        id: 'a',
        name: 'Ada',
        onboarded: true,
        roles: [],
        permissions,
      }),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountWelcome(): Promise<ReturnType<typeof mount>> {
  vi.resetModules()
  const { default: WelcomeScreen } = await import('./WelcomeScreen.vue')
  const screen = mount(WelcomeScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return screen
}

/** The admin screens offered, leaving out the journey doors. */
function adminPaths(screen: ReturnType<typeof mount>): unknown[] {
  return screen
    .findAllComponents(RouterLinkStub)
    .map((link) => link.props('to') as unknown)
    .filter((to) => String(to).startsWith('/admin/'))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('WelcomeScreen', () => {
  it('greets the member by name', async () => {
    signedIn([])

    expect((await mountWelcome()).find('h1').text()).toBe('Welcome, Ada')
  })

  it('offers each admin screen by the permission it needs (R-ROLE-4)', async () => {
    signedIn(['applicant:review'])
    expect(adminPaths(await mountWelcome())).toEqual(['/admin/applicants'])
  })

  it('offers the outbound log only to a holder of outbox:read (R-ROLE-4)', async () => {
    signedIn(['outbox:read'])
    const admin = await mountWelcome()
    signedIn([])
    const member = await mountWelcome()

    expect(adminPaths(admin)).toEqual(['/admin/outbox'])
    expect(adminPaths(member)).toEqual([])
  })

  it('leads to the member’s matches (F8)', async () => {
    signedIn([])
    const links = (await mountWelcome()).findAllComponents(RouterLinkStub)

    expect(links.map((link) => link.props('to') as unknown)).toContain(
      '/matches',
    )
  })

  it('opens the Ask door onto the Ask journey (F5)', async () => {
    signedIn([])
    const door = (await mountWelcome()).findComponent(RouterLinkStub)

    expect(door.props('to')).toBe('/ask')
    expect(door.text()).toContain('Ask for help')
  })

  it('signs out on the server, then goes to the login screen', async () => {
    const fetchMock = signedIn([])
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    const screen = await mountWelcome()

    await screen.find('button').trigger('click')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith('/auth/logout', { method: 'POST' })
    expect(assign).toHaveBeenCalledWith('/login')
  })

  it('stays, and says so, when signing out fails', async () => {
    signedIn([])
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    const screen = await mountWelcome()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    )

    await screen.find('button').trigger('click')
    await flushPromises()

    expect(assign).not.toHaveBeenCalled()
    expect(screen.find('[role="alert"]').text()).toContain('still signed in')
  })
})
