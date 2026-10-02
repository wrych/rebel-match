import { describe, expect, it } from 'vitest'
import { startOutboxRetention } from './outbox-retention.js'

const now = new Date('2026-11-08T10:00:00Z')

interface Harness {
  cutoffs: Date[]
  errors: unknown[]
  scheduled: { run: () => void; everyMs: number } | null
  stopped: boolean
  stop: () => void
}

function start(
  purge: () => Promise<number> = () => Promise.resolve(0),
): Harness {
  const harness: Harness = {
    cutoffs: [],
    errors: [],
    scheduled: null,
    stopped: false,
    stop: () => undefined,
  }
  harness.stop = startOutboxRetention({
    log: {
      purgeBefore: (cutoff) => {
        harness.cutoffs.push(cutoff)
        return purge()
      },
    },
    retentionDays: 90,
    intervalHours: 24,
    now: () => now,
    onError: (error) => harness.errors.push(error),
    schedule: (run, everyMs) => {
      harness.scheduled = { run, everyMs }
      return () => {
        harness.stopped = true
      }
    },
  })
  return harness
}

describe('startOutboxRetention', () => {
  it('purges at once, so a restart never delays retention (R-MSG-6)', () => {
    const { cutoffs } = start()

    expect(cutoffs).toEqual([new Date('2026-08-10T10:00:00Z')])
  })

  it('then purges again on every interval', () => {
    const harness = start()

    expect(harness.scheduled?.everyMs).toBe(24 * 3_600_000)
    harness.scheduled?.run()
    expect(harness.cutoffs).toHaveLength(2)
  })

  it('reports a failed purge and keeps its schedule', async () => {
    const harness = start(() => Promise.reject(new Error('db down')))
    await Promise.resolve()

    expect(harness.errors).toHaveLength(1)
    harness.scheduled?.run()
    expect(harness.cutoffs).toHaveLength(2)
  })

  it('can be stopped', () => {
    const harness = start()

    harness.stop()

    expect(harness.stopped).toBe(true)
  })
})
