import { describe, expect, it } from 'vitest'
import type { NetworkTimeline } from '../../src/network/timeline'
import { createPlayer, frameAt, type Ticker } from './replay'

const timeline: NetworkTimeline = {
  nodes: [
    { id: 0, at: 0, day: '2026-10-01', self: false },
    { id: 1, at: 0.3, day: '2026-10-02', self: true },
    { id: 2, at: 0.8, day: '2026-10-06', self: false },
  ],
  links: [
    { source: 0, target: 1, at: 0.5, day: '2026-10-04' },
    { source: 1, target: 2, at: 1, day: '2026-10-09' },
  ],
  moons: [{ node: 1, at: 0.6, day: '2026-10-05' }],
}

describe('frameAt (R-NET-1)', () => {
  it('shows the first node at the start', () => {
    expect(frameAt(timeline, 0)).toEqual({
      progress: 0,
      nodes: 1,
      links: 0,
      moons: 0,
      day: '2026-10-01',
    })
  })

  it('shows what has appeared by then, on the latest day reached', () => {
    expect(frameAt(timeline, 0.6)).toMatchObject({
      nodes: 2,
      links: 1,
      moons: 1,
      day: '2026-10-05',
    })
  })

  it('shows everything at the end, and clamps beyond it', () => {
    expect(frameAt(timeline, 2)).toMatchObject({
      progress: 1,
      nodes: 3,
      links: 2,
      day: '2026-10-09',
    })
  })

  it('shows nothing of an empty network', () => {
    expect(frameAt({ nodes: [], links: [], moons: [] }, 0.5)).toMatchObject({
      nodes: 0,
      links: 0,
      day: null,
    })
  })
})

function fakeTicker(): Ticker & { advance(ms: number): void; pending: number } {
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
    get pending() {
      return queued.length
    },
  }
}

describe('createPlayer', () => {
  function setup(): {
    ticker: ReturnType<typeof fakeTicker>
    seen: number[]
    ends: number[]
    player: ReturnType<typeof createPlayer>
  } {
    const ticker = fakeTicker()
    const seen: number[] = []
    const ends: number[] = []
    const player = createPlayer({
      durationMs: 1000,
      ticker,
      onProgress: (progress) => seen.push(progress),
      onEnd: () => ends.push(1),
    })
    return { ticker, seen, ends, player }
  }

  it('plays to the end over its duration, then ends once', () => {
    const { ticker, seen, ends, player } = setup()

    player.play()
    ticker.advance(250)
    ticker.advance(750)
    ticker.advance(100)

    expect(seen).toEqual([0.25, 1])
    expect(ends).toEqual([1])
    expect(player.playing).toBe(false)
  })

  it('pauses where it is and resumes from there', () => {
    const { ticker, seen, player } = setup()

    player.play()
    ticker.advance(400)
    player.pause()
    ticker.advance(5000)
    player.play()
    ticker.advance(100)

    expect(seen).toEqual([0.4, 0.5])
  })

  it('seeks without playing', () => {
    const { ticker, player } = setup()

    player.seek(1.5)
    ticker.advance(100)

    expect(player.progress).toBe(1)
    expect(player.playing).toBe(false)
  })

  it('starts over when played from the end, or restarted', () => {
    const { ticker, seen, player } = setup()

    player.seek(1)
    player.play()
    ticker.advance(500)
    player.restart()
    ticker.advance(100)

    expect(seen).toEqual([1, 0.5, 0, 0.1])
  })

  it('stops for good when stopped', () => {
    const { ticker, player } = setup()

    player.play()
    player.stop()

    expect(ticker.pending).toBe(0)
  })
})
