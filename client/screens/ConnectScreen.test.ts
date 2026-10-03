// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Matches } from '../lib/challenges'
import ConnectScreen from './ConnectScreen.vue'

const route = {
  params: { challengeId: 'c1', memberId: 'm2' },
  query: { kind: 'same_boat' } as Record<string, string>,
}
vi.mock('vue-router', () => ({ useRoute: () => route }))

const peer = {
  memberId: 'm2',
  name: 'Sam Boat',
  jobTitle: 'Lead',
  org: 'Acme',
  sector: null,
  note: 'Roles and circles, and nobody decides.',
}

const matches: Matches = {
  trend: { id: '02', short: 'Network of Teams', from: 'Pyramid', peers: 3 },
  sameBoat: [peer],
  beenThere: [],
  cases: [],
}

/** Serves the matches and config, and answers the request with `status`. */
function server(status = 201): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'POST')
      return Promise.resolve({ ok: status < 300, status })
    const body =
      url === '/api/config'
        ? { limits: { connectionMessageMaxChars: 600 } }
        : matches
    return Promise.resolve({ ok: true, status: 200, json: async () => body })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(ConnectScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return screen
}

async function send(screen: ReturnType<typeof mount>): Promise<void> {
  await screen.find('textarea').setValue('  Shall we compare notes?  ')
  await screen.find('form').trigger('submit')
  await flushPromises()
}

afterEach(() => {
  vi.unstubAllGlobals()
  route.query = { kind: 'same_boat' }
})

describe('ConnectScreen', () => {
  it('shows who they are asking and that nothing is shared yet (R-CONN-1)', async () => {
    server()
    const screen = await mountScreen()

    expect(screen.find('h1').text()).toBe('Connect with Sam')
    expect(screen.text()).toContain('Lead · Acme')
    expect(screen.text()).toContain('Nothing is shared until Sam accepts')
    expect(screen.html()).not.toContain('@')
  })

  it('limits the message to the configured length (R-CFG-2)', async () => {
    server()
    const screen = await mountScreen()

    expect(screen.find('textarea').attributes('maxlength')).toBe('600')
  })

  it('sends a pending request for this challenge (R-CONN-1)', async () => {
    const fetchMock = server()
    const screen = await mountScreen()
    await send(screen)

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/connections',
      expect.objectContaining({
        body: JSON.stringify({
          targetId: 'm2',
          challengeId: 'c1',
          kind: 'same_boat',
          message: '  Shall we compare notes?  ',
        }),
      }),
    )
    expect(screen.text()).toContain('Request sent')
    expect(screen.findComponent(RouterLinkStub).props('to')).toBe(
      '/challenges/c1/matches',
    )
  })

  it('says when they already asked and are waiting (R-CONN-5)', async () => {
    server(409)
    const screen = await mountScreen()
    await send(screen)

    expect(screen.text()).toContain('You already asked Sam')
  })

  it('says there is nobody when the server refuses the request', async () => {
    server(404)
    const screen = await mountScreen()
    await send(screen)

    expect(screen.find('.empty').text()).toContain('nobody to ask')
  })

  it('says so when the request did not send', async () => {
    server(500)
    const screen = await mountScreen()
    await send(screen)

    expect(screen.find('[role="alert"]').text()).toContain('did not send')
  })

  it('asks a been-there peer only from the been-there section', async () => {
    server()
    route.query = { kind: 'been_there' }

    expect((await mountScreen()).find('.empty').text()).toContain(
      'nobody to ask',
    )
  })

  it('refuses a link with no valid kind', async () => {
    const fetchMock = server()
    route.query = { kind: 'follow' }
    const screen = await mountScreen()

    expect(screen.find('.empty').exists()).toBe(true)
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/matches'),
    )
  })

  it('says so when the page cannot be loaded', async () => {
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
