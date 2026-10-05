import { describe, expect, it, vi } from 'vitest'
import { startTokenPurge } from './token-purge.js'

describe('startTokenPurge (ADR 0034)', () => {
  it('purges at once and on every interval', async () => {
    const purgeExpired = vi.fn(() =>
      Promise.resolve({ sessions: 0, tokens: 0 }),
    )
    let tick: (() => void) | undefined
    let every = 0

    startTokenPurge({
      auth: { purgeExpired },
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

    expect(purgeExpired).toHaveBeenCalledTimes(2)
    expect(every).toBe(2 * 3_600_000)
  })

  it('reports a failed purge and keeps the schedule', async () => {
    const onError = vi.fn()

    startTokenPurge({
      auth: { purgeExpired: () => Promise.reject(new Error('db down')) },
      intervalHours: 1,
      onError,
      schedule: () => () => undefined,
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(onError).toHaveBeenCalledTimes(1)
  })
})
