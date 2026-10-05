import { describe, expect, it, vi } from 'vitest'
import { startErasureSweep } from './erasure-sweep.js'

describe('startErasureSweep (ADR 0032)', () => {
  it('sweeps at once and on every interval', async () => {
    const eraseDue = vi.fn(() => Promise.resolve(0))
    let tick: (() => void) | undefined
    let every = 0

    startErasureSweep({
      erasure: { eraseDue },
      intervalHours: 2,
      onError: vi.fn(),
      schedule: (run, everyMs) => {
        tick = run
        every = everyMs
        return () => undefined
      },
    })
    tick?.()
    await Promise.resolve()

    expect(eraseDue).toHaveBeenCalledTimes(2)
    expect(every).toBe(2 * 3_600_000)
  })

  it('reports a failed sweep and keeps the schedule', async () => {
    const onError = vi.fn()

    startErasureSweep({
      erasure: { eraseDue: () => Promise.reject(new Error('db down')) },
      intervalHours: 1,
      onError,
      schedule: () => () => undefined,
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(onError).toHaveBeenCalledTimes(1)
  })
})
