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

/** The UI events the screen posted, as sent. */
function events(): unknown[] {
  return vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => url === '/api/events')
    .map(([, init]) => JSON.parse(String(init?.body)))
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

  it('copies the email to the clipboard (R-CONN-3)', async () => {
    const contact = {
      name: 'Sam Boat',
      email: 'sam@example.invalid',
      mailto: 'mailto:sam@example.invalid',
      over: [],
    }
    serve({ ok: true, status: 200, json: async () => ({ contact }) })
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const screen = await mountScreen()

    await screen
      .find('button[aria-label="Copy Sam Boat’s email"]')
      .trigger('click')
    await flushPromises()

    expect(writeText).toHaveBeenCalledWith('sam@example.invalid')
    expect(screen.find('[role="status"]').text()).toContain('Copied')
  })

  it('reports writing and copying, without whom to (R-ANA-1, R-ANA-3)', async () => {
    const contact = {
      name: 'Sam Boat',
      email: 'sam@example.invalid',
      mailto: 'mailto:sam@example.invalid',
      over: [],
    }
    serve({ ok: true, status: 200, json: async () => ({ contact }) })
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
    const screen = await mountScreen()
    expect(events()).toEqual([])

    await screen
      .find('button[aria-label="Copy Sam Boat’s email"]')
      .trigger('click')
    await flushPromises()
    screen.find('a.btn-primary').element.addEventListener('click', (event) => {
      event.preventDefault()
    })
    await screen.find('a.btn-primary').trigger('click')

    expect(events()).toEqual([
      { event: 'contact_reached_out', props: { method: 'copy' } },
      { event: 'contact_reached_out', props: { method: 'email' } },
    ])
  })

  it('says so when the email cannot be copied', async () => {
    const contact = {
      name: 'Sam Boat',
      email: 'sam@example.invalid',
      mailto: 'mailto:sam@example.invalid',
      over: [],
    }
    serve({ ok: true, status: 200, json: async () => ({ contact }) })
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    const screen = await mountScreen()

    await screen
      .find('button[aria-label="Copy Sam Boat’s email"]')
      .trigger('click')
    await flushPromises()

    expect(screen.find('[role="status"]').text()).toContain('not copied')
  })

  it('lists what the two are connected over, the unopened first and outlined, a withdrawn challenge without its text (R-CONN-10, R-ASK-17)', async () => {
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
          challenge: {
            id: 'c1',
            body: null,
            trendShort: 'Purpose',
            withdrawn: true,
          },
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
            withdrawn: false,
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
    expect(cards[1]?.text()).toContain('A withdrawn challenge')
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
