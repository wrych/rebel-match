import { describe, expect, it, vi } from 'vitest'
import { createTick, type ScheduledJob } from './tick.js'

const HOUR = 3_600_000

function job(
  everyMs: number,
  run = vi.fn(() => Promise.resolve()),
): { job: ScheduledJob; run: typeof run } {
  return { job: { run, everyMs } satisfies ScheduledJob, run }
}

describe('createTick (ADR 0049)', () => {
  it('runs every job on the first tick', async () => {
    const often = job(0)
    const hourly = job(HOUR)
    const tick = createTick({
      jobs: [often.job, hourly.job],
      now: () => 0,
      onError: vi.fn(),
    })

    expect(await tick.run()).toBe(true)

    expect(often.run).toHaveBeenCalledTimes(1)
    expect(hourly.run).toHaveBeenCalledTimes(1)
  })

  it('runs an every-tick job each time, an hourly one once its hour has passed', async () => {
    let at = 0
    const often = job(0)
    const hourly = job(HOUR)
    const tick = createTick({
      jobs: [often.job, hourly.job],
      now: () => at,
      onError: vi.fn(),
    })

    await tick.run()
    at = HOUR - 1
    await tick.run()
    at = HOUR
    await tick.run()

    expect(often.run).toHaveBeenCalledTimes(3)
    expect(hourly.run).toHaveBeenCalledTimes(2)
  })

  it('reports a failed job, still runs the others, and waits its turn to retry', async () => {
    let at = 0
    const onError = vi.fn()
    const failing = job(
      HOUR,
      vi.fn(() => Promise.reject(new Error('db down'))),
    )
    const other = job(0)
    const tick = createTick({
      jobs: [failing.job, other.job],
      now: () => at,
      onError,
    })

    expect(await tick.run()).toBe(false)
    at = 60_000
    expect(await tick.run()).toBe(true)

    expect(onError).toHaveBeenCalledTimes(1)
    expect(failing.run).toHaveBeenCalledTimes(1)
    expect(other.run).toHaveBeenCalledTimes(2)
  })

  it('lets a tick that arrives mid-run share it rather than run twice', async () => {
    let finish = (): void => undefined
    const slow = job(
      0,
      vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve
          }),
      ),
    )
    const tick = createTick({ jobs: [slow.job], onError: vi.fn() })

    const first = tick.run()
    const second = tick.run()
    finish()

    expect(await Promise.all([first, second])).toEqual([true, true])
    expect(slow.run).toHaveBeenCalledTimes(1)
  })
})
