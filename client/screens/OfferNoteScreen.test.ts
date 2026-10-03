// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import OfferNoteScreen from './OfferNoteScreen.vue'

const route = { params: { challengeId: 'c1' } }
vi.mock('vue-router', () => ({ useRoute: () => route }))

const card = {
  challengeId: 'c1',
  body: 'Two shifts, two cultures.',
  trend: { id: '02', short: 'Network of Teams' },
  author: { name: 'Ola Nyberg', jobTitle: null, org: 'Björk', sector: null },
}
const minChars = 31
const substantive = 'We ran into exactly this and wrote a shift charter.'

function server(
  swipe = {
    status: 201,
    body: { result: 'recorded', connection: { result: 'created' } },
  },
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string) => {
    if (url === '/api/swipe')
      return Promise.resolve({
        ok: swipe.status < 300,
        status: swipe.status,
        json: async () => swipe.body,
      })
    const body =
      url === '/api/config'
        ? {
            limits: {
              beenThereNoteMinChars: minChars,
              connectionMessageMaxChars: 600,
            },
          }
        : { cards: [card] }
    return Promise.resolve({ ok: true, status: 200, json: async () => body })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(OfferNoteScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return screen
}

function sendButton(screen: ReturnType<typeof mount>): HTMLButtonElement {
  return screen.find('button[type="submit"]').element as HTMLButtonElement
}

afterEach(() => {
  vi.unstubAllGlobals()
  route.params = { challengeId: 'c1' }
})

describe('OfferNoteScreen', () => {
  it('shows whom the offer goes to and their challenge', async () => {
    server()
    const screen = await mountScreen()

    expect(screen.find('h1').text()).toBe('Offer to Ola')
    expect(screen.text()).toContain('Two shifts, two cultures.')
    expect(screen.text()).toContain('Nothing is shared until they accept')
  })

  it('keeps Send disabled at 30 characters and counts them (R-OFF-4)', async () => {
    server()
    const screen = await mountScreen()
    await screen.find('textarea').setValue(`  ${'x'.repeat(minChars - 1)}  `)

    expect(sendButton(screen).disabled).toBe(true)
    expect(screen.find('#note-count').text()).toContain(
      `${String(minChars - 1)} characters`,
    )
    await screen.find('textarea').setValue('x'.repeat(minChars))
    expect(sendButton(screen).disabled).toBe(false)
  })

  it('sends the been-there answer with its note (R-OFF-3,4)', async () => {
    const fetchMock = server()
    const screen = await mountScreen()
    await screen.find('textarea').setValue(substantive)
    await screen.find('form').trigger('submit')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/swipe',
      expect.objectContaining({
        body: JSON.stringify({
          challengeId: 'c1',
          action: 'been_there',
          note: substantive,
        }),
      }),
    )
    expect(screen.text()).toContain('Offer sent')
    expect(screen.findComponent(RouterLinkStub).props('to')).toBe('/offer')
  })

  it('says when the member already reached out (R-CONN-5)', async () => {
    server({
      status: 201,
      body: { result: 'recorded', connection: { result: 'exists' } },
    })
    const screen = await mountScreen()
    await screen.find('textarea').setValue(substantive)
    await screen.find('form').trigger('submit')
    await flushPromises()

    expect(screen.text()).toContain('You already reached out to Ola')
  })

  it('answers nothing for a card no longer in the deck', async () => {
    server()
    route.params = { challengeId: 'gone' }

    expect((await mountScreen()).find('.empty').text()).toContain(
      'no open challenge',
    )
  })

  it('says so when the offer did not send', async () => {
    server({
      status: 500,
      body: { result: 'recorded', connection: { result: 'created' } },
    })
    const screen = await mountScreen()
    await screen.find('textarea').setValue(substantive)
    await screen.find('form').trigger('submit')
    await flushPromises()

    expect(screen.find('[role="alert"]').text()).toContain('did not send')
  })
})
