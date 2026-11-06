// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PersonConnectScreen from './PersonConnectScreen.vue'

const route = {
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
}

function server(
  status = 201,
  answer: unknown = {},
  cardStatus = 200,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/profile-codes/open')
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ card, memberId: 'm-ben' }),
      })
    if (init?.method === 'POST')
      return Promise.resolve({
        ok: status < 300,
        status,
        json: async () => answer,
      })
    if (url === '/api/config')
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ limits: { connectionMessageMaxChars: 600 } }),
      })
    return Promise.resolve({
      ok: cardStatus < 300,
      status: cardStatus,
      json: async () => ({ card, memberId: 'm-ben' }),
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(PersonConnectScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return screen
}

async function send(screen: ReturnType<typeof mount>): Promise<void> {
  await screen.find('textarea').setValue('We met at lunch')
  await screen.find('form').trigger('submit')
  await flushPromises()
}

afterEach(() => {
  vi.unstubAllGlobals()
  replace.mockReset()
  Object.assign(route, { params: { memberId: 'm-ben' }, hash: '' })
})

describe('PersonConnectScreen (S46)', () => {
  it('shows who they are asking, directly, with nothing shared yet', async () => {
    server()
    const screen = await mountScreen()

    expect(screen.find('h1').text()).toBe('Connect with Ben')
    expect(screen.text()).toContain('Direct')
    expect(screen.text()).toContain('Nothing is shared until Ben accepts')
    expect(screen.find('textarea').attributes('maxlength')).toBe('600')
  })

  it('sends a direct request about no challenge, then S13 (R-FIND-7)', async () => {
    const fetchMock = server()
    const screen = await mountScreen()
    await send(screen)

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/connections',
      expect.objectContaining({
        body: JSON.stringify({
          targetId: 'm-ben',
          kind: 'direct',
          message: 'We met at lunch',
        }),
      }),
    )
    expect(screen.text()).toContain('Request sent')
    expect(screen.text()).toContain('Over to Ben')
  })

  it('takes members already connected to the contact (R-CONN-8)', async () => {
    server(200, { result: 'joined', id: 'r1' })
    const screen = await mountScreen()
    await send(screen)

    expect(replace).toHaveBeenCalledWith('/matches/requests/r1/contact')
  })

  it('says plainly when the day’s limit is reached (R-FIND-7)', async () => {
    server(429, { result: 'limit' })
    const screen = await mountScreen()
    await send(screen)

    expect(screen.find('[role=alert]').text()).toContain(
      'as many direct requests as a day allows',
    )
    expect(screen.find('button[type=submit]').attributes()).toHaveProperty(
      'disabled',
    )
  })

  it('says there is nobody to ask for a member it cannot reach', async () => {
    server(201, {}, 404)
    const screen = await mountScreen()

    expect(screen.find('.empty').text()).toContain('nobody to ask')
  })

  it('sends the profile code with a request reached through it (R-CODE-3)', async () => {
    Object.assign(route, { params: {}, hash: '#t=tok-1' })
    const fetchMock = server()
    const screen = await mountScreen()
    await send(screen)

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/connections',
      expect.objectContaining({
        body: JSON.stringify({
          targetId: 'm-ben',
          kind: 'direct',
          message: 'We met at lunch',
          profileCode: 'tok-1',
        }),
      }),
    )
    expect(screen.findComponent(RouterLinkStub).props('to')).toBe('/matches')
  })
})
