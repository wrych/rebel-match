// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import type { NetworkTimeline } from '../lib/network'
import NetworkScreen from './NetworkScreen.vue'

const replace = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/network' }),
  useRouter: () => ({ replace }),
}))

const timeline: NetworkTimeline = {
  nodes: [
    { id: 0, at: 0, day: '2026-10-01', self: false },
    { id: 1, at: 0.5, day: '2026-10-03', self: true },
  ],
  links: [{ source: 0, target: 1, at: 1, day: '2026-10-05' }],
  moons: [],
  own: { count: 1, needed: 0, shown: true },
}

const GraphStub = defineComponent({
  name: 'NetworkGraph',
  props: { timeline: { type: Object, required: true } },
  emits: ['frame', 'end'],
  template: '<div class="graph-stub" />',
})

function serve(answer: NetworkTimeline | null | 'broken'): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        answer === 'broken'
          ? { ok: false, status: 500 }
          : answer === null
            ? { ok: false, status: 404 }
            : { ok: true, status: 200, json: async () => answer },
      ),
    ),
  )
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(NetworkScreen, {
    global: { stubs: { NetworkGraph: GraphStub } },
  })
  await flushPromises()
  return screen
}

afterEach(() => {
  vi.unstubAllGlobals()
  replace.mockClear()
})

describe('NetworkScreen (R-NET-1, R-NET-2)', () => {
  it('replays the network it is given', async () => {
    serve(timeline)
    const screen = await mountScreen()

    expect(screen.findComponent(GraphStub).props('timeline')).toEqual(timeline)
  })

  it('says it is you once the replay ends, and not after going back', async () => {
    serve(timeline)
    const screen = await mountScreen()
    const graph = screen.findComponent(GraphStub)

    graph.vm.$emit('end')
    await flushPromises()
    expect(screen.find('.you').exists()).toBe(true)

    graph.vm.$emit('frame', { progress: 0.2, nodes: 1, links: 0, day: null })
    await flushPromises()
    expect(screen.find('.you').exists()).toBe(false)
  })

  it('explains why the member’s own lines are missing (R-NET-13)', async () => {
    serve({
      ...timeline,
      links: [],
      own: { count: 2, needed: 5, shown: false },
    })
    const screen = await mountScreen()

    expect(screen.find('.hint').text()).toContain('You have 2 connections')
  })

  it('says nothing of own lines that show', async () => {
    serve(timeline)
    const screen = await mountScreen()

    expect(screen.find('.hint').exists()).toBe(false)
  })

  it('is not found while hosts have it off (R-NET-6)', async () => {
    serve(null)
    await mountScreen()

    expect(replace).toHaveBeenCalledWith({
      name: 'not-found',
      params: { pathMatch: ['network'] },
    })
  })

  it('says when the network could not be loaded', async () => {
    serve('broken')
    const screen = await mountScreen()

    expect(screen.find('[role="alert"]').text()).toBe(
      'The network could not be loaded.',
    )
  })

  it('says so before anyone has joined', async () => {
    serve({ nodes: [], links: [], moons: [], own: null })
    const screen = await mountScreen()

    expect(screen.find('.empty').exists()).toBe(true)
    expect(screen.findComponent(GraphStub).exists()).toBe(false)
  })
})
