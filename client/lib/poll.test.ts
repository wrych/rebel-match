import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { poll, type Page } from './poll'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function fakePage(): Page & { hide: () => void; show: () => void } {
  let hidden = false
  const listeners = new Set<() => void>()
  return {
    hidden: () => hidden,
    onShown: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    hide: () => {
      hidden = true
    },
    show: () => {
      hidden = false
      for (const listener of listeners) listener()
    },
  }
}

describe('poll (R-MINE-4)', () => {
  it('refreshes every interval while the page is visible', () => {
    const refresh = vi.fn()
    poll(refresh, 30_000, fakePage())

    vi.advanceTimersByTime(90_000)

    expect(refresh).toHaveBeenCalledTimes(3)
  })

  it('waits while the page is hidden, and catches up when it is shown', () => {
    const refresh = vi.fn()
    const page = fakePage()
    poll(refresh, 30_000, page)

    page.hide()
    vi.advanceTimersByTime(90_000)
    expect(refresh).not.toHaveBeenCalled()

    page.show()
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('stops for good once stopped', () => {
    const refresh = vi.fn()
    const page = fakePage()
    const stop = poll(refresh, 30_000, page)

    stop()
    vi.advanceTimersByTime(90_000)
    page.show()

    expect(refresh).not.toHaveBeenCalled()
  })
})
