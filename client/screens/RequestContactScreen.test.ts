// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RequestContactScreen from './RequestContactScreen.vue'

vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 'r1' } }) }))

function serve(response: object): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(RequestContactScreen)
  await flushPromises()
  return screen
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RequestContactScreen', () => {
  it('shows the email and a pre-filled mailto once accepted (R-CONN-3)', async () => {
    const contact = {
      name: 'Sam Boat',
      email: 'sam@example.invalid',
      mailto: 'mailto:sam@example.invalid?subject=Rebel%20Match',
      over: [],
    }
    serve({ ok: true, status: 200, json: async () => ({ contact }) })
    const screen = await mountScreen()

    expect(screen.text()).toContain('sam@example.invalid')
    expect(screen.find('a').attributes('href')).toBe(contact.mailto)
  })

  it('lists what the two are connected over, the unopened first and outlined (R-CONN-10)', async () => {
    const entry = {
      direction: 'outgoing',
      kind: 'same_boat',
      status: 'accepted',
      createdAt: '2026-11-08T10:00:00.000Z',
      other: { memberId: 'm2', name: 'Sam Boat' },
    }
    const contact = {
      name: 'Sam Boat',
      email: 'sam@example.invalid',
      mailto: 'mailto:sam@example.invalid',
      over: [
        {
          ...entry,
          id: 'r1',
          message: null,
          challenge: { id: 'c1', body: 'Old news.', trendShort: 'Purpose' },
          unseen: false,
        },
        {
          ...entry,
          id: 'r2',
          direction: 'incoming',
          kind: 'been_there',
          message: 'We wrote a shift charter.',
          challenge: {
            id: 'c2',
            body: 'Two shifts, two cultures.',
            trendShort: 'Network of Teams',
          },
          unseen: true,
        },
      ],
    }
    serve({ ok: true, status: 200, json: async () => ({ contact }) })
    const screen = await mountScreen()

    expect(screen.find('#over').text()).toBe('Connected over')
    const cards = screen.findAll('article')
    expect(cards.map((card) => card.classes('card-new'))).toEqual([true, false])
    expect(cards[0]?.text()).toContain('Sam Boat reached out')
    expect(cards[0]?.text()).toContain('Been there')
    expect(cards[0]?.text()).toContain('About Network of Teams')
    expect(cards[0]?.text()).toContain('Two shifts, two cultures.')
    expect(cards[0]?.text()).toContain('“We wrote a shift charter.”')
    expect(cards[1]?.text()).toContain('You reached out')
    expect(cards[1]?.text()).toContain('Same boat')
  })

  it('shows no contact when the server gives none (R-CONN-6)', async () => {
    serve({ ok: false, status: 404 })
    const screen = await mountScreen()

    expect(screen.find('.empty').text()).toContain('only once a request')
    expect(screen.find('a').exists()).toBe(false)
  })

  it('says so when the contact cannot be loaded', async () => {
    serve({ ok: false, status: 500 })

    expect((await mountScreen()).find('[role="alert"]').text()).toContain(
      'could not be loaded',
    )
  })
})
