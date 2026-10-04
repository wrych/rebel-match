import { describe, expect, it } from 'vitest'
import { startSettingsRefresh } from './settings-refresh.js'

describe('startSettingsRefresh (ADR 0031)', () => {
  it('refreshes on every interval', () => {
    let refreshes = 0
    let run = (): void => undefined
    let every = 0
    startSettingsRefresh({
      settings: {
        refresh: () => {
          refreshes += 1
          return Promise.resolve()
        },
      },
      intervalSeconds: 60,
      onError: () => undefined,
      schedule: (scheduled, everyMs) => {
        run = scheduled
        every = everyMs
        return () => undefined
      },
    })
    run()
    run()

    expect(every).toBe(60_000)
    expect(refreshes).toBe(2)
  })

  it('reports a failed refresh and keeps going', async () => {
    const errors: unknown[] = []
    let run = (): void => undefined
    startSettingsRefresh({
      settings: { refresh: () => Promise.reject(new Error('down')) },
      intervalSeconds: 60,
      onError: (error) => errors.push(error),
      schedule: (scheduled) => {
        run = scheduled
        return () => undefined
      },
    })
    run()
    await Promise.resolve()
    await Promise.resolve()

    expect(errors).toHaveLength(1)
  })
})
