// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import {
  arrivals,
  useLiveList,
  type LiveList,
  type PollLimit,
} from './live-list'
import type { Page } from './poll'

const idOf = (item: { id: string }): string => item.id

describe('arrivals (R-NAV-12)', () => {
  it('counts nothing from the first look as new', () => {
    const seen = arrivals(idOf)

    seen.see([{ id: 'a' }, { id: 'b' }])

    expect(seen.isNew({ id: 'a' })).toBe(false)
    expect(seen.isNew({ id: 'b' })).toBe(false)
  })

  it('marks what a later look brings until it is tapped', () => {
    const seen = arrivals(idOf)
    seen.see([{ id: 'a' }])

    seen.see([{ id: 'b' }, { id: 'a' }])

    expect(seen.isNew({ id: 'b' })).toBe(true)
    expect(seen.isNew({ id: 'a' })).toBe(false)
    seen.clear({ id: 'b' })
    expect(seen.isNew({ id: 'b' })).toBe(false)
  })

  it('does not mark again what came back after leaving the list', () => {
    const seen = arrivals(idOf)
    seen.see([{ id: 'a' }])
    seen.see([])

    seen.see([{ id: 'a' }])

    expect(seen.isNew({ id: 'a' })).toBe(false)
  })

  it('starts over when forgotten, as after a changed filter', () => {
    const seen = arrivals(idOf)
    seen.see([{ id: 'a' }])
    seen.see([{ id: 'a' }, { id: 'b' }])

    seen.forget()
    seen.see([{ id: 'c' }])

    expect(seen.isNew({ id: 'b' })).toBe(false)
    expect(seen.isNew({ id: 'c' })).toBe(false)
  })
})

function visiblePage(): Page {
  return { hidden: () => false, onShown: () => () => undefined }
}

function respondWithLimits(limits: Record<string, number>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ limits }),
    }),
  )
}

function host(
  load: () => Promise<void>,
  interval: PollLimit = 'outboxPollSeconds',
): { live: LiveList; unmount: () => void } {
  let live: LiveList | undefined
  const wrapper = mount(
    defineComponent({
      setup() {
        live = useLiveList(load, interval, visiblePage())
        return () => h('div')
      },
    }),
  )
  if (live === undefined) throw new Error('not set up')
  return { live, unmount: () => wrapper.unmount() }
}

describe('useLiveList (R-NAV-12)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('re-reads at the interval its own setting names', async () => {
    respondWithLimits({ outboxPollSeconds: 8, membersPollSeconds: 60 })
    const load = vi.fn().mockResolvedValue(undefined)
    host(load)
    await flushPromises()

    await vi.advanceTimersByTimeAsync(24_000)

    expect(load).toHaveBeenCalledTimes(3)
  })

  it('stops re-reading once the screen is left', async () => {
    respondWithLimits({ outboxPollSeconds: 8 })
    const load = vi.fn().mockResolvedValue(undefined)
    const { unmount } = host(load)
    await flushPromises()

    unmount()
    await vi.advanceTimersByTimeAsync(24_000)

    expect(load).not.toHaveBeenCalled()
  })

  it('refreshes when asked, and says so while it runs', async () => {
    respondWithLimits({ outboxPollSeconds: 8 })
    let finish: () => void = () => undefined
    const load = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)))
    const { live } = host(load)

    const done = live.refresh()
    expect(live.refreshing).toBe(true)
    finish()
    await done

    expect(live.refreshing).toBe(false)
    expect(load).toHaveBeenCalledOnce()
  })

  it('never reads twice at once, but reads again for a request made meanwhile', async () => {
    respondWithLimits({ outboxPollSeconds: 8 })
    const finishers: (() => void)[] = []
    const load = vi.fn(
      () => new Promise<void>((resolve) => finishers.push(resolve)),
    )
    const { live } = host(load)
    await flushPromises()

    const first = live.refresh()
    void live.refresh()
    await vi.advanceTimersByTimeAsync(8000)
    expect(load).toHaveBeenCalledOnce()

    finishers[0]?.()
    await flushPromises()
    expect(load).toHaveBeenCalledTimes(2)
    finishers[1]?.()
    await first
  })

  it('keeps going after a failed read', async () => {
    respondWithLimits({ outboxPollSeconds: 8 })
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined)
    const { live } = host(load)

    await live.refresh()
    await live.refresh()

    expect(load).toHaveBeenCalledTimes(2)
    expect(live.refreshing).toBe(false)
  })

  it('refreshes only when asked without the limits', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const load = vi.fn().mockResolvedValue(undefined)
    const { live } = host(load)
    await flushPromises()

    await vi.advanceTimersByTimeAsync(60_000)
    expect(load).not.toHaveBeenCalled()
    await live.refresh()
    expect(load).toHaveBeenCalledOnce()
    expect(live.pullPx).toBeNull()
  })
})
