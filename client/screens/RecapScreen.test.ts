// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import type { Recap } from '../lib/recap'
import RecapScreen from './RecapScreen.vue'

const replace = vi.fn()
const push = vi.fn()
const back = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/recap' }),
  useRouter: () => ({ replace, push, back }),
}))
vi.mock('../lib/session', () => ({
  loadMe: () => Promise.resolve({ name: 'Ada Lovelace' }),
}))

const recap: Recap = {
  joined: '2026-09-02',
  members: 1,
  rows: [],
  events: [],
  timeline: { nodes: [], links: [], moons: [], own: null },
}

const StoriesStub = defineComponent({
  name: 'RecapStories',
  props: {
    recap: { type: Object, required: true },
    name: { type: String, required: true },
    storyMs: { type: Number, required: true },
    networkStoryMs: { type: Number, required: true },
    site: { type: String, required: true },
  },
  emits: ['shared', 'close'],
  template: '<div class="stories-stub" />',
})

type Answer = Recap | null | 'broken'

function serve(answer: Answer): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/config')
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            limits: { recapStorySeconds: 6, recapNetworkStorySeconds: 10 },
          }),
      })
    if (url === '/api/events')
      return Promise.resolve({ ok: true, status: 204, init })
    return Promise.resolve(
      answer === 'broken'
        ? { ok: false, status: 500 }
        : answer === null
          ? { ok: false, status: 404 }
          : { ok: true, status: 200, json: () => Promise.resolve(answer) },
    )
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const sentEvents = (fetchMock: ReturnType<typeof vi.fn>): unknown[] =>
  fetchMock.mock.calls
    .filter(([url]) => url === '/api/events')
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)))

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(RecapScreen, {
    global: { stubs: { RecapStories: StoriesStub } },
  })
  await flushPromises()
  return screen
}

afterEach(() => {
  vi.unstubAllGlobals()
  replace.mockClear()
  push.mockClear()
  back.mockClear()
})

describe('RecapScreen (R-RECAP-1, R-RECAP-7)', () => {
  it('plays the member’s recap at the hosts’ pace, and says it opened', async () => {
    const fetchMock = serve(recap)
    const screen = await mountScreen()

    const stories = screen.findComponent(StoriesStub)
    expect(stories.props('recap')).toEqual(recap)
    expect(stories.props('name')).toBe('Ada Lovelace')
    expect(stories.props('storyMs')).toBe(6000)
    expect(stories.props('networkStoryMs')).toBe(10_000)
    expect(sentEvents(fetchMock)).toEqual([
      { event: 'recap_opened', props: {} },
    ])
  })

  it('reports how the card was shared', async () => {
    const fetchMock = serve(recap)
    const screen = await mountScreen()

    screen.findComponent(StoriesStub).vm.$emit('shared', 'linkedin')

    expect(sentEvents(fetchMock)).toContainEqual({
      event: 'recap_shared',
      props: { via: 'linkedin' },
    })
  })

  it('goes to the matches when closed with nowhere to go back to', async () => {
    serve(recap)
    const screen = await mountScreen()

    screen.findComponent(StoriesStub).vm.$emit('close')
    await flushPromises()

    expect(push).toHaveBeenCalledWith({ name: 'cockpit' })
  })

  it('goes back when closed after coming from another screen', async () => {
    serve(recap)
    window.history.replaceState({ back: '/matches' }, '')
    const screen = await mountScreen()

    screen.findComponent(StoriesStub).vm.$emit('close')
    await flushPromises()

    expect(back).toHaveBeenCalled()
    window.history.replaceState(null, '')
  })

  it('is not found while hosts have it closed', async () => {
    serve(null)
    await mountScreen()

    expect(replace).toHaveBeenCalledWith({
      name: 'not-found',
      params: { pathMatch: ['recap'] },
    })
  })

  it('says so when the recap cannot be loaded', async () => {
    serve('broken')
    const screen = await mountScreen()

    expect(screen.find('[role="alert"]').text()).toBe(
      'Your record could not be loaded.',
    )
  })
})
