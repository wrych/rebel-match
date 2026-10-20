import { describe, expect, it, vi } from 'vitest'
import { startCrownCheck } from './crown-check.js'

describe('startCrownCheck (R-BADGE-3)', () => {
  it('checks at once and on every interval', async () => {
    const checkCrowns = vi.fn(() => Promise.resolve())
    let tick: (() => void) | undefined
    let every = 0

    startCrownCheck({
      badges: { checkCrowns },
      intervalMinutes: 15,
      onError: vi.fn(),
      schedule: (run, everyMs) => {
        tick = run
        every = everyMs
        return () => undefined
      },
    })
    tick?.()
    await Promise.resolve()

    expect(checkCrowns).toHaveBeenCalledTimes(2)
    expect(every).toBe(15 * 60_000)
  })

  it('reports a failed check and keeps the schedule', async () => {
    const onError = vi.fn()

    startCrownCheck({
      badges: { checkCrowns: () => Promise.reject(new Error('db down')) },
      intervalMinutes: 15,
      onError,
      schedule: () => () => undefined,
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(onError).toHaveBeenCalledTimes(1)
  })
})
