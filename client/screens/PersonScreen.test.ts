// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PersonScreen from './PersonScreen.vue'

const replace = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/people/m-ben', params: { memberId: 'm-ben' } }),
  useRouter: () => ({ replace }),
}))

function server(status: number): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: status < 300,
        status,
        json: async () => ({
          card: {
            memberId: 'm-ben',
            name: 'Ben Okafor',
            jobTitle: 'Coach',
            org: 'Acme',
            sector: null,
            companySize: null,
          },
        }),
      }),
    ),
  )
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
})

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
})
