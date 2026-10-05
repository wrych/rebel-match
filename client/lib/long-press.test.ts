import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { longPress } from './long-press'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('longPress (R-MEM-3)', () => {
  it('fires after the hold, and the click that follows ends it once', () => {
    const onHold = vi.fn()
    const press = longPress(onHold, () => 500)

    press.start()
    vi.advanceTimersByTime(500)
    press.release()

    expect(onHold).toHaveBeenCalledTimes(1)
    expect(press.held()).toBe(true)
    expect(press.held()).toBe(false)
  })

  it('does not fire when released early', () => {
    const onHold = vi.fn()
    const press = longPress(onHold, () => 500)

    press.start()
    vi.advanceTimersByTime(499)
    press.release()
    vi.advanceTimersByTime(10)

    expect(onHold).not.toHaveBeenCalled()
    expect(press.held()).toBe(false)
  })

  it('keeps a hold when touch reports leaving after the release', () => {
    const press = longPress(vi.fn(), () => 500)

    press.start()
    vi.advanceTimersByTime(500)
    press.release()
    press.abandon()

    expect(press.held()).toBe(true)
  })

  it('forgets a hold that ends off the element, so no later click is lost', () => {
    const press = longPress(vi.fn(), () => 500)

    press.start()
    vi.advanceTimersByTime(500)
    press.abandon()

    expect(press.held()).toBe(false)
  })
})
