// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PersonScreen from './PersonScreen.vue'

const route = {
  path: '/people/m-ben',
  params: { memberId: 'm-ben' } as Record<string, string>,
  hash: '',
}
const replace = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ replace }),
}))

const card = {
  memberId: 'm-ben',
  name: 'Ben Okafor',
  jobTitle: 'Coach',
  org: 'Acme',
  sector: null,
  companySize: null,
  connectionId: null as string | null,
}

function server(status: number): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(() =>
    Promise.resolve({
      ok: status < 300,
      status,
      json: async () => ({ card, memberId: 'm-ben' }),
    }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(PersonScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return screen
}

afterEach(() => {
  vi.unstubAllGlobals()
  replace.mockReset()
  card.connectionId = null
  Object.assign(route, {
    path: '/people/m-ben',
    params: { memberId: 'm-ben' },
    hash: '',
  })
})

const linkTargets = (screen: ReturnType<typeof mount>): unknown[] =>
  screen.findAllComponents(RouterLinkStub).map((link) => link.props('to'))

describe('PersonScreen (S45)', () => {
  it('shows the card with Connect (R-FIND-6)', async () => {
    server(200)
    const screen = await mountScreen()

    expect(screen.find('h1').text()).toBe('Ben Okafor')
    expect(screen.text()).toContain('Coach · Acme')
    expect(
      screen.findAllComponents(RouterLinkStub).map((link) => link.props('to')),
    ).toContain('/people/m-ben/connect')
  })

  it('is not found for a member search would not find (R-NAV-8)', async () => {
    server(404)
    await mountScreen()

    expect(replace).toHaveBeenCalledWith({
      name: 'not-found',
      params: { pathMatch: ['people', 'm-ben'] },
    })
  })

  it('opens a profile code from the fragment, its token in the body (R-CODE-3)', async () => {
    Object.assign(route, { path: '/p', params: {}, hash: '#t=tok-1' })
    const fetchMock = server(200)
    const screen = await mountScreen()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/profile-codes/open',
      expect.objectContaining({ body: JSON.stringify({ token: 'tok-1' }) }),
    )
    expect(screen.find('h1').text()).toBe('Ben Okafor')
    expect(linkTargets(screen)).toEqual(['/p/connect#t=tok-1'])
  })

  it('is not found for a code that cannot be used, saying nothing (R-CODE-3)', async () => {
    Object.assign(route, { path: '/p', params: {}, hash: '#t=old' })
    server(404)
    const screen = await mountScreen()

    expect(replace).toHaveBeenCalledWith({
      name: 'not-found',
      params: { pathMatch: ['p'] },
    })
    expect(screen.text()).toBe('')
  })

  it('leads a member already connected to the contact, not to Connect (R-CONN-8)', async () => {
    card.connectionId = 'r 1'
    server(200)
    const screen = await mountScreen()

    expect(screen.text()).toContain('You are already connected')
    expect(screen.text()).toContain('Connected')
    expect(linkTargets(screen)).toEqual([
      '/matches/requests/r%201/contact',
      '/people',
    ])
  })
})
