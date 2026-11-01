import type { NetworkTimeline } from '../../src/network/timeline'

/** One moment of the replay: how many nodes, links and moons show, each a
 * prefix of the timeline's lists, and the day it has reached. */
export interface Frame {
  progress: number
  nodes: number
  links: number
  moons: number
  day: string | null
}

const unit = (value: number): number => Math.min(Math.max(value, 0), 1)

function shownBy(places: readonly { at: number }[], progress: number): number {
  let low = 0
  let high = places.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if ((places[middle]?.at ?? 1) <= progress) low = middle + 1
    else high = middle
  }
  return low
}

/** What shows at `progress`, 0 to 1 (R-NET-1, R-NET-7, R-NET-11). */
export function frameAt(timeline: NetworkTimeline, progress: number): Frame {
  const clamped = unit(progress)
  const nodes = shownBy(timeline.nodes, clamped)
  const links = shownBy(timeline.links, clamped)
  const moons = shownBy(timeline.moons, clamped)
  const days = [
    timeline.nodes[nodes - 1]?.day,
    timeline.links[links - 1]?.day,
    timeline.moons[moons - 1]?.day,
  ].filter((shown): shown is string => shown !== undefined)
  const day = days.sort().at(-1) ?? null
  return { progress: clamped, nodes, links, moons, day }
}

/** The clock a player runs on: the browser's frames, or a test's. */
export interface Ticker {
  now(): number
  next(step: () => void): () => void
}

/** Plays progress from 0 to 1 over a duration, and is told where to go. A
 * presentation can drive it as the member's screen does. */
export interface Player {
  play(): void
  pause(): void
  restart(): void
  seek(progress: number): void
  readonly playing: boolean
  readonly progress: number
  stop(): void
}

interface PlayerOptions {
  durationMs: number
  ticker: Ticker
  onProgress: (progress: number) => void
  onEnd?: () => void
}

class TickingPlayer implements Player {
  progress = 0
  private startedAt = 0
  private cancel: (() => void) | null = null

  constructor(private readonly options: PlayerOptions) {}

  get playing(): boolean {
    return this.cancel !== null
  }

  play(): void {
    if (this.cancel !== null) return
    if (this.progress >= 1) this.progress = 0
    this.anchor()
    this.cancel = this.options.ticker.next(this.step)
  }

  pause(): void {
    this.cancel?.()
    this.cancel = null
  }

  restart(): void {
    this.pause()
    this.progress = 0
    this.options.onProgress(0)
    this.play()
  }

  seek(progress: number): void {
    this.progress = unit(progress)
    this.anchor()
    this.options.onProgress(this.progress)
  }

  stop(): void {
    this.pause()
  }

  private anchor(): void {
    this.startedAt =
      this.options.ticker.now() - this.progress * this.options.durationMs
  }

  private readonly step = (): void => {
    const { ticker, durationMs } = this.options
    this.progress = unit((ticker.now() - this.startedAt) / durationMs)
    this.options.onProgress(this.progress)
    if (this.progress < 1) {
      this.cancel = ticker.next(this.step)
      return
    }
    this.cancel = null
    this.options.onEnd?.()
  }
}

/** A player calling `onProgress` on every frame and `onEnd` once it reaches
 * the end. */
export function createPlayer(options: PlayerOptions): Player {
  return new TickingPlayer(options)
}

/** The browser's animation frames as a ticker. */
export const frameTicker: Ticker = {
  now: () => performance.now(),
  next(step) {
    const handle = requestAnimationFrame(step)
    return () => cancelAnimationFrame(handle)
  },
}
