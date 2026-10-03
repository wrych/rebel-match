// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DeckCard } from '../lib/deck'
import OfferScreen from './OfferScreen.vue'

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

const cards: DeckCard[] = [
  {
    challengeId: 'c1',
    body: 'Two shifts, two cultures.',
    trend: { id: '02', short: 'Network of Teams' },
    author: {
      name: 'Ola Nyberg',
      jobTitle: null,
      org: 'Björk',
      sector: 'Manufacturing',
    },
  },
  {
    challengeId: 'c2',
    body: 'Our salary model still reflects the old hierarchy.',
    trend: { id: '08', short: 'Talents & Mastery' },
    author: { name: 'Tobias Renner', jobTitle: null, org: null, sector: null },
  },
]

/** Serves `decks` in turn for each deck read, and answers with `swipe`. */
function server(
  decks: DeckCard[][],
  swipe: { status: number; body?: object } = {
    status: 201,
    body: { result: 'recorded' },
  },
): ReturnType<typeof vi.fn> {
  const reads = [...decks]
  const fetchMock = vi.fn((url: string) => {
    if (url === '/api/swipe')
      return Promise.resolve({
        ok: swipe.status < 300,
        status: swipe.status,
        json: async () => swipe.body,
      })
    const next = reads.length > 1 ? reads.shift() : reads[0]
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ cards: next }),
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(OfferScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
    attachTo: document.body,
  })
  await flushPromises()
  return screen
}

async function click(
  screen: ReturnType<typeof mount>,
  text: string,
): Promise<void> {
  const button = screen
    .findAll('button')
    .find((each) => each.text().includes(text))
  await button?.trigger('click')
  await flushPromises()
}

afterEach(() => {
  vi.unstubAllGlobals()
  push.mockReset()
  document.body.innerHTML = ''
})

describe('OfferScreen', () => {
  it('shows one card: text, trend, author and organization (R-OFF-1,2)', async () => {
    server([cards])
    const screen = await mountScreen()

    expect(screen.find('.deck-text').text()).toBe('Two shifts, two cultures.')
    expect(screen.text()).toContain('Network of Teams')
    expect(screen.text()).toContain('Ola Nyberg')
    expect(screen.text()).toContain('Björk · Manufacturing')
    expect(screen.text()).toContain('1 of 2')
  })

  it('browses with the arrow buttons and keys (R-OFF-1)', async () => {
    server([cards])
    const screen = await mountScreen()

    await screen.find('[aria-label="Next challenge"]').trigger('click')
    expect(screen.find('.deck-text').text()).toContain('salary model')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    await flushPromises()
    expect(screen.find('.deck-text').text()).toBe('Two shifts, two cultures.')
  })

  it('sends a same-boat request and moves on (R-OFF-3)', async () => {
    const fetchMock = server([cards], {
      status: 201,
      body: { result: 'recorded', connection: { result: 'created', id: 'r1' } },
    })
    const screen = await mountScreen()
    await click(screen, 'Same boat')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/swipe',
      expect.objectContaining({
        body: JSON.stringify({ challengeId: 'c1', action: 'same_boat' }),
      }),
    )
    expect(screen.find('[role="status"]').text()).toContain('same boat')
    expect(screen.find('.deck-text').text()).toContain('salary model')
  })

  it('opens the note screen for been there (R-OFF-4)', async () => {
    server([cards])
    await click(await mountScreen(), 'Been there')

    expect(push).toHaveBeenCalledWith('/offer/c1/note')
  })

  it('follows the topic and skips, each moving on', async () => {
    server([cards, []])
    const screen = await mountScreen()
    await click(screen, 'Follow topic')

    expect(screen.find('[role="status"]').text()).toBe(
      'Following “Network of Teams”.',
    )
    await click(screen, 'Skip')
    expect(screen.text()).toContain('You’ve seen them all')
  })

  it('asks for more when the hand is empty, then says there are none (R-OFF-5)', async () => {
    const fetchMock = server([[cards[0]!], []])
    const screen = await mountScreen()
    await click(screen, 'Skip')

    expect(
      fetchMock.mock.calls.filter(([url]) => url === '/api/deck'),
    ).toHaveLength(2)
    expect(screen.findComponent(RouterLinkStub).props('to')).toBe('/ask')
  })

  it('says so when an answer did not save, and keeps the card', async () => {
    server([cards], { status: 500 })
    const screen = await mountScreen()
    await click(screen, 'Skip')

    expect(screen.find('[role="alert"]').text()).toContain('did not save')
    expect(screen.find('.deck-text').text()).toBe('Two shifts, two cultures.')
  })

  it('says so when the deck cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    )
    const screen = await mountScreen()

    expect(screen.find('[role="alert"]').text()).toContain(
      'could not be loaded',
    )
    expect(screen.text()).not.toContain('seen them all')
  })
})
