// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import type { Recap } from '../lib/recap'
import type { Ticker } from '../network/replay'
import type { SceneFactory } from '../network/scene'
import RecapStories from './RecapStories.vue'

const recap: Recap = {
  joined: '2026-09-02',
  members: 2,
  rows: [
    {
      row: 'speak',
      count: 3,
      level: 'Agitator',
      reached: 2,
      levels: 3,
      crown: { name: 'Ringleader', held: true },
      below: 80,
    },
    {
      row: 'help',
      count: 0,
      level: null,
      reached: 0,
      levels: 3,
      crown: { name: 'Liberator', held: false },
      below: null,
    },
  ],
  events: [
    {
      id: 'e1',
      name: 'Stormed the Summit',
      ticketLine: 'SUMMIT',
      bigLine: '26',
      hasLogo: false,
    },
  ],
  timeline: {
    nodes: [
      { id: 0, at: 0, day: '2026-09-01', self: false },
      { id: 1, at: 0.5, day: '2026-09-02', self: true },
    ],
    links: [],
    moons: [],
    own: null,
  },
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

const scene: SceneFactory = () => ({
  show: () => undefined,
  highlight: () => undefined,
  recentre: () => undefined,
  dispose: () => undefined,
})

const PreviewStub = defineComponent({
  name: 'RecapCardPreview',
  props: {
    card: { type: Object, required: true },
    site: { type: String, required: true },
    halo: { type: Function, required: true },
    angle: { type: Number, required: true },
    ticker: { type: Object, default: null },
  },
  template: '<div class="preview-stub" />',
})

const STORY_MS = 1000
const NETWORK_MS = 3000
let wrapper: VueWrapper | null = null

function mountStories(ticker = fakeTicker()): {
  wrapper: VueWrapper
  ticker: ReturnType<typeof fakeTicker>
  rendered: { name: string; halo: boolean }[]
} {
  const rendered: { name: string; halo: boolean }[] = []
  wrapper = mount(RecapStories, {
    attachTo: document.body,
    global: { stubs: { RecapCardPreview: PreviewStub } },
    props: {
      recap,
      name: 'Ada Rebel',
      storyMs: STORY_MS,
      networkStoryMs: NETWORK_MS,
      site: 'https://rebel.test',
      ticker,
      scene,
      render: (card, _site, halo) => {
        rendered.push({ name: card.name, halo: halo !== null })
        return Promise.resolve(new File(['png'], 'card.png'))
      },
    },
  })
  return { wrapper, ticker, rendered }
}

const story = (): string =>
  [...(document.querySelector('.story')?.children ?? [])]
    .map((child) => child.textContent?.trim() ?? '')
    .join(' ')

function tap(at: 'left' | 'right'): void {
  const taps = document.querySelector('.taps') as HTMLElement
  Object.defineProperty(taps, 'clientWidth', { value: 300 })
  taps.dispatchEvent(new PointerEvent('pointerdown'))
  const up = new PointerEvent('pointerup')
  Object.defineProperty(up, 'offsetX', { value: at === 'left' ? 20 : 280 })
  taps.dispatchEvent(up)
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  URL.createObjectURL = () => 'blob:card'
  URL.revokeObjectURL = () => undefined
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.unstubAllGlobals()
})

describe('RecapStories (R-RECAP-1, R-RECAP-2)', () => {
  it('tells the beats in order, a bar each, the zero row left out', () => {
    const { wrapper } = mountStories()

    const kinds = (wrapper.vm as unknown as { beats: { kind: string }[] }).beats
    expect(kinds.map((beat) => beat.kind)).toEqual([
      'intro',
      'joined',
      'row',
      'crowns',
      'events',
      'network',
      'card',
    ])
    expect(document.querySelectorAll('.segment')).toHaveLength(7)
    expect(story()).toContain('Your rebel record')
  })

  it('moves on by itself after each story’s time', async () => {
    const { ticker } = mountStories()

    ticker.advance(STORY_MS)
    await flushPromises()

    expect(story()).toContain('Rebel no. 2')
  })

  it('keeps a network story up for its own, longer time, to read its end', async () => {
    const { ticker } = mountStories()

    ticker.advance(STORY_MS)
    await flushPromises()
    expect(story()).toContain('Rebel no. 2')

    ticker.advance(NETWORK_MS - 1)
    await flushPromises()
    expect(story()).toContain('Rebel no. 2')

    ticker.advance(1)
    await flushPromises()
    expect(story()).toContain('3 challenges posted')
  })

  it('goes forward on a tap at the right and back at the left', async () => {
    mountStories()

    tap('right')
    tap('right')
    await flushPromises()
    expect(story()).toContain('3 challenges posted')
    expect(story()).toContain('Agitator')
    expect(story()).toContain('Ahead of 80% of rebels')

    tap('left')
    await flushPromises()
    expect(story()).toContain('Rebel no. 2')
  })

  it('holds the story while pressed', async () => {
    const { ticker } = mountStories()
    const taps = document.querySelector('.taps') as HTMLElement

    taps.dispatchEvent(new PointerEvent('pointerdown'))
    ticker.advance(STORY_MS * 3)
    await flushPromises()

    expect(story()).toContain('Your rebel record')
  })

  it('ends on the card, its surroundings turning, the image drawn once with them still, LinkedIn first (R-RECAP-5)', async () => {
    const { wrapper, rendered } = mountStories()

    ;(wrapper.vm as unknown as { go(to: number): void }).go(6)
    await flushPromises()

    expect(rendered).toEqual([{ name: 'Ada Rebel', halo: true }])
    const preview = wrapper.findComponent(PreviewStub)
    expect(preview.props('angle')).toBe(0.6)
    const halo = preview.props('halo') as (angle: number) => unknown
    expect(halo(1)).not.toEqual(halo(2))
    const buttons = [...document.querySelectorAll('.actions button')].map(
      (button) => button.textContent?.trim(),
    )
    expect(buttons).toEqual(['Share on LinkedIn', 'Save image'])
  })

  it('reports a saved image as shared', async () => {
    const { wrapper } = mountStories()
    const clicked = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)

    ;(wrapper.vm as unknown as { go(to: number): void }).go(6)
    await flushPromises()
    ;(document.querySelectorAll('.actions button')[1] as HTMLElement).click()

    expect(clicked).toHaveBeenCalled()
    expect(wrapper.emitted('shared')).toEqual([['image']])
  })

  it('tells the events attended, with their tickets (R-RECAP-2)', async () => {
    const { wrapper } = mountStories()

    ;(wrapper.vm as unknown as { go(to: number): void }).go(4)
    await flushPromises()

    expect(story()).toContain('You attended 1 event so far')
    expect(story()).toContain('Where do we meet next time?')
    expect(document.querySelectorAll('.tickets svg')).toHaveLength(1)
  })

  it('closes on the cross', () => {
    const { wrapper } = mountStories()

    ;(document.querySelector('.close') as HTMLElement).click()

    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
