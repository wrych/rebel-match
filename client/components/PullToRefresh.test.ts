// @vitest-environment jsdom
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import PullToRefresh from './PullToRefresh.vue'

function touch(type: string, ...ys: number[]): void {
  const event = new Event(type)
  Object.defineProperty(event, 'touches', {
    value: ys.map((clientY) => ({ clientX: 100, clientY })),
  })
  document.dispatchEvent(event)
}

function scrolledTo(y: number): void {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
}

function mountPull(pullPx: number | null = 70): {
  live: { refresh: ReturnType<typeof vi.fn> }
  pull: ReturnType<typeof mount>
} {
  const live = reactive({
    refreshing: false,
    pullPx,
    refresh: vi.fn().mockResolvedValue(undefined),
  })
  const pull = mount(PullToRefresh, { props: { live } })
  return { live, pull }
}

enableAutoUnmount(afterEach)

afterEach(() => {
  scrolledTo(0)
})

describe('PullToRefresh (R-NAV-12)', () => {
  it('refreshes when a finger pulls the top of the page far enough', async () => {
    const { live, pull } = mountPull()

    touch('touchstart', 100)
    touch('touchmove', 180)
    await flushPromises()
    expect(pull.text()).toBe('Release to refresh')
    touch('touchend')
    await flushPromises()

    expect(live.refresh).toHaveBeenCalledOnce()
  })

  it('does nothing for a short pull', async () => {
    const { live, pull } = mountPull()

    touch('touchstart', 100)
    touch('touchmove', 140)
    await flushPromises()
    expect(pull.text()).toBe('Pull to refresh')
    touch('touchend')

    expect(live.refresh).not.toHaveBeenCalled()
  })

  it('leaves a scroll further down the page alone', () => {
    const { live } = mountPull()
    scrolledTo(300)

    touch('touchstart', 100)
    touch('touchmove', 300)
    touch('touchend')

    expect(live.refresh).not.toHaveBeenCalled()
  })

  it('leaves a two-finger zoom alone', () => {
    const { live } = mountPull()

    touch('touchstart', 100, 200)
    touch('touchmove', 300, 400)
    touch('touchend')

    expect(live.refresh).not.toHaveBeenCalled()
  })

  it('offers nothing until it knows how far to pull', () => {
    const { live } = mountPull(null)

    touch('touchstart', 100)
    touch('touchmove', 400)
    touch('touchend')

    expect(live.refresh).not.toHaveBeenCalled()
  })

  it('keeps the browser’s own pull-to-reload off while it is shown', () => {
    const { pull } = mountPull()
    expect(document.documentElement.classList).toContain('live-pull')

    pull.unmount()

    expect(document.documentElement.classList).not.toContain('live-pull')
  })
})
