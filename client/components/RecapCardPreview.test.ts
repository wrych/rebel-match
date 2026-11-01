// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ticker } from '../network/replay'
import type { Card } from '../recap/card'
import RecapCardPreview from './RecapCardPreview.vue'

const card: Card = {
  title: 'Your rebel record',
  name: 'Ada Rebel',
  figures: [
    {
      count: 3,
      counts: 'challenges posted',
      level: null,
      crown: null,
      reached: 0,
      levels: 3,
    },
  ],
}

function fakeTicker(): Ticker & {
  advance(ms: number): void
  queued: () => number
} {
  let time = 0
  let queued: (() => void)[] = []
  return {
    now: () => time,
    next(step) {
      queued.push(step)
      return () => {
        queued = queued.filter((each) => each !== step)
      }
    },
    advance(ms) {
      time += ms
      const due = queued
      queued = []
      for (const step of due) step()
    },
    queued: () => queued.length,
  }
}

// A 2D context that records what is drawn, for the canvases jsdom lacks.
function fakeContext(): Record<string, unknown> {
  const ignore = (): void => undefined
  return new Proxy(
    { measureText: () => ({ width: 10 }) } as Record<string, unknown>,
    {
      get: (target, key) => target[key as string] ?? ignore,
      set: (target, key, value) => {
        target[key as string] = value
        return true
      },
    },
  )
}

let wrapper: VueWrapper | null = null
let reduced = false

beforeEach(() => {
  reduced = false
  vi.stubGlobal('matchMedia', () => ({ matches: reduced }))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => fakeContext() as unknown as CanvasRenderingContext2D,
  )
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { load: () => Promise.resolve([]) },
  })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function mountPreview(ticker = fakeTicker()): {
  angles: number[]
  ticker: ReturnType<typeof fakeTicker>
} {
  const angles: number[] = []
  wrapper = mount(RecapCardPreview, {
    props: {
      card,
      site: 'https://rebel.test',
      angle: 0.6,
      ticker,
      halo: (angle: number) => {
        angles.push(angle)
        return { dots: [{ x: 0, y: 0, fade: 1, self: true }], lines: [] }
      },
    },
  })
  return { angles, ticker }
}

describe('RecapCardPreview (R-RECAP-5)', () => {
  it('draws the card with its surroundings at the image’s angle, then turns them', async () => {
    const { angles, ticker } = mountPreview()
    await flushPromises()

    expect(angles).toEqual([0.6])
    ticker.advance(15_000)

    expect(angles[1]).toBeCloseTo(0.6 + Math.PI / 2)
  })

  it('stays still for a reader who asks for less motion', async () => {
    reduced = true
    const { angles, ticker } = mountPreview()
    await flushPromises()

    ticker.advance(15_000)

    expect(angles).toEqual([0.6])
  })

  it('stops turning once it is gone', async () => {
    const { ticker } = mountPreview()
    await flushPromises()

    wrapper?.unmount()
    wrapper = null

    expect(ticker.queued()).toBe(0)
  })
})
