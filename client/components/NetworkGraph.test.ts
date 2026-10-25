// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NetworkTimeline } from '../../src/network/timeline'
import type { Frame, Ticker } from '../network/replay'
import type { SceneFactory } from '../network/scene'
import NetworkGraph from './NetworkGraph.vue'

const timeline: NetworkTimeline = {
  nodes: [
    { id: 0, at: 0, day: '2026-10-01', self: false },
    { id: 1, at: 0.5, day: '2026-10-03', self: true },
  ],
  links: [{ source: 0, target: 1, at: 1, day: '2026-10-05' }],
}

function fakeTicker(): Ticker & { advance(ms: number): void } {
  let time = 0
  let queued: (() => void)[] = []
  return {
    now: () => time,
    next(step) {
      queued.push(step)
      return () => {
        queued = queued.filter((candidate) => candidate !== step)
      }
    },
    advance(ms) {
      time += ms
      const due = queued
      queued = []
      for (const step of due) step()
    },
  }
}

function fakeScene(): {
  factory: SceneFactory
  shown: Frame[]
  highlights: boolean[]
  disposed: () => boolean
  still: () => boolean | null
} {
  const shown: Frame[] = []
  const highlights: boolean[] = []
  let disposed = false
  let still: boolean | null = null
  return {
    factory: (_host, _timeline, points, options) => {
      expect(points).toHaveLength(2)
      still = options.still
      return {
        show: (frame) => shown.push(frame),
        highlight: (on) => highlights.push(on),
        dispose: () => {
          disposed = true
        },
      }
    },
    shown,
    highlights,
    disposed: () => disposed,
    still: () => still,
  }
}

function reducedMotion(on: boolean): void {
  vi.stubGlobal('matchMedia', () => ({ matches: on }))
}

beforeEach(() => reducedMotion(false))
afterEach(() => vi.unstubAllGlobals())

function setup(props: Record<string, unknown> = {}): {
  graph: ReturnType<typeof mount>
  scene: ReturnType<typeof fakeScene>
  ticker: ReturnType<typeof fakeTicker>
} {
  const scene = fakeScene()
  const ticker = fakeTicker()
  const graph = mount(NetworkGraph, {
    props: {
      timeline,
      durationMs: 1000,
      scene: scene.factory,
      ticker,
      ...props,
    },
  })
  return { graph, scene, ticker }
}

describe('NetworkGraph (R-NET-1, R-NET-2)', () => {
  it('replays the network and turns to the viewer at the end', async () => {
    const { graph, scene, ticker } = setup()

    ticker.advance(600)
    expect(scene.shown.at(-1)).toMatchObject({ nodes: 2, links: 0 })
    expect(scene.highlights).toEqual([])

    ticker.advance(400)
    expect(scene.shown.at(-1)).toMatchObject({ nodes: 2, links: 1 })
    expect(scene.highlights).toEqual([true])
    expect(graph.emitted('end')).toHaveLength(1)
  })

  it('reports each frame', () => {
    const { graph, ticker } = setup()

    ticker.advance(250)

    expect(graph.emitted('frame')?.at(-1)).toEqual([
      { progress: 0.25, nodes: 1, links: 0, day: '2026-10-01' },
    ])
  })

  it('pauses, and plays on from where it was', async () => {
    const { graph, scene, ticker } = setup()

    ticker.advance(200)
    await graph.vm.$nextTick()
    await graph.find('button').trigger('click')
    ticker.advance(5000)
    expect(scene.shown.at(-1)?.progress).toBe(0.2)

    await graph.find('button').trigger('click')
    ticker.advance(100)
    expect(scene.shown.at(-1)?.progress).toBeCloseTo(0.3)
  })

  it('jumps to a moment from the timeline, and leaves the viewer there', async () => {
    const { graph, scene } = setup({ autoplay: false })
    const scrub = graph.find('input[type="range"]')

    await scrub.setValue('1000')
    expect(scene.highlights).toEqual([true])

    await scrub.setValue('300')
    expect(scene.shown.at(-1)).toMatchObject({ progress: 0.3, nodes: 1 })
    expect(scene.highlights).toEqual([true, false])
  })

  it('replays from the start', async () => {
    const { graph, scene, ticker } = setup()

    ticker.advance(1000)
    await graph.vm.$nextTick()
    const replay = graph.findAll('button').at(-1)
    await replay?.trigger('click')

    expect(scene.shown.at(-1)?.progress).toBe(0)
  })

  it('shows the end at once for a member who prefers reduced motion', () => {
    reducedMotion(true)
    const { scene } = setup()

    expect(scene.still()).toBe(true)
    expect(scene.shown.at(-1)).toMatchObject({ nodes: 2, links: 1 })
    expect(scene.highlights).toEqual([true])
  })

  it('lights nobody up when asked not to', () => {
    const { scene, ticker } = setup({ highlightSelf: false })

    ticker.advance(1000)

    expect(scene.highlights).toEqual([false])
  })

  it('leaves the controls to whoever drives it, when asked', () => {
    const { graph } = setup({ controls: false })

    expect(graph.find('input').exists()).toBe(false)
    expect(graph.find('button').exists()).toBe(false)
  })

  it('lets go of the scene when it leaves', () => {
    const { graph, scene } = setup()

    graph.unmount()

    expect(scene.disposed()).toBe(true)
  })
})
