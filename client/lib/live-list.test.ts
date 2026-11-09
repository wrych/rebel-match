// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import {
  arrivals,
  useLiveList,
  useLiveResource,
  type LiveList,
  type LiveResource,
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

function inScreen<R>(use: () => R): { used: R; unmount: () => void } {
  let used: R | undefined
  const wrapper = mount(
    defineComponent({
      setup() {
        used = use()
        return () => h('div')
      },
    }),
  )
  if (used === undefined) throw new Error('not set up')
  return { used, unmount: () => wrapper.unmount() }
}

function host(
  load: () => Promise<void>,
  interval: PollLimit = 'outboxPollSeconds',
): { live: LiveList; unmount: () => void } {
  const { used, unmount } = inScreen(() =>
    useLiveList(load, interval, visiblePage()),
  )
  return { live: used, unmount }
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

const FAILURE = 'The list could not be loaded.'

type Item = { id: string }

function hostResource(
  fetch: () => Promise<Item[]>,
): LiveResource<Item[], Item, never[]> {
  return inScreen(() =>
    useLiveResource(
      fetch,
      'outboxPollSeconds',
      {
        initial: [],
        failure: FAILURE,
        arrivals: { of: (found) => found, id: idOf },
      },
      visiblePage(),
    ),
  ).used
}

describe('useLiveResource (R-NAV-12)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    respondWithLimits({ outboxPollSeconds: 8 })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('shows nothing and is not loaded before the first read', () => {
    const resource = hostResource(vi.fn().mockResolvedValue([{ id: 'a' }]))

    expect(resource.data.value).toEqual([])
    expect(resource.loaded.value).toBe(false)
    expect(resource.problem.value).toBeNull()
  })

  it('shows what a read brings', async () => {
    const resource = hostResource(vi.fn().mockResolvedValue([{ id: 'a' }]))

    await resource.live.refresh()

    expect(resource.data.value).toEqual([{ id: 'a' }])
    expect(resource.loaded.value).toBe(true)
  })

  it('says so when the first read fails', async () => {
    const resource = hostResource(vi.fn().mockRejectedValue(new Error('down')))

    await resource.live.refresh()

    expect(resource.problem.value).toBe(FAILURE)
    expect(resource.loaded.value).toBe(true)
  })

  it('keeps what is shown, and says nothing, when a later read fails', async () => {
    const resource = hostResource(
      vi
        .fn()
        .mockResolvedValueOnce([{ id: 'a' }])
        .mockRejectedValue(new Error('down')),
    )
    await resource.live.refresh()

    await vi.advanceTimersByTimeAsync(8000)

    expect(resource.data.value).toEqual([{ id: 'a' }])
    expect(resource.problem.value).toBeNull()
  })

  it('clears the failure once a read succeeds', async () => {
    const resource = hostResource(
      vi
        .fn()
        .mockRejectedValueOnce(new Error('down'))
        .mockResolvedValue([{ id: 'a' }]),
    )
    await resource.live.refresh()

    await resource.live.refresh()

    expect(resource.problem.value).toBeNull()
    expect(resource.data.value).toEqual([{ id: 'a' }])
  })

  it('marks what a polled read brings until it is tapped', async () => {
    const resource = hostResource(
      vi
        .fn()
        .mockResolvedValueOnce([{ id: 'a' }])
        .mockResolvedValue([{ id: 'b' }, { id: 'a' }]),
    )
    await resource.live.refresh()

    await vi.advanceTimersByTimeAsync(8000)

    expect(resource.arrived.isNew({ id: 'a' })).toBe(false)
    expect(resource.arrived.isNew({ id: 'b' })).toBe(true)
    resource.arrived.clear({ id: 'b' })
    expect(resource.arrived.isNew({ id: 'b' })).toBe(false)
  })

  it('starts a new list on restart: empty, not loaded, nothing new', async () => {
    let finish: (items: Item[]) => void = () => undefined
    const resource = hostResource(
      vi
        .fn()
        .mockResolvedValueOnce([{ id: 'a' }])
        .mockImplementation(
          () => new Promise<Item[]>((resolve) => (finish = resolve)),
        ),
    )
    await resource.live.refresh()

    const restarted = resource.restart()
    expect(resource.data.value).toEqual([])
    expect(resource.loaded.value).toBe(false)
    finish([{ id: 'b' }])
    await restarted

    expect(resource.arrived.isNew({ id: 'b' })).toBe(false)
    expect(resource.loaded.value).toBe(true)
  })
})
