import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultConfig } from '../config.js'
import { retentionCutoff } from './outbox-log.js'
import {
  scheduledJobs,
  startEvery,
  timerJobs,
  type JobName,
  type NamedJob,
  type TimerDeps,
} from './scheduled-jobs.js'

const HOUR = 3_600_000
const now = new Date('2026-11-08T10:00:00Z')

interface Calls {
  calls: string[]
  cutoffs: Map<string, Date>
}

function recordingDeps(): TimerDeps & Calls {
  const calls: string[] = []
  const cutoffs = new Map<string, Date>()
  const called = (name: string) => () => {
    calls.push(name)
    return Promise.resolve(0)
  }
  const purged = (name: string) => (cutoff: Date) => {
    calls.push(name)
    cutoffs.set(name, cutoff)
    return Promise.resolve(0)
  }
  return {
    calls,
    cutoffs,
    auth: { purgeExpired: called('tokens') },
    erasure: { eraseDue: called('erasure') },
    outbox: { purgeBefore: purged('outbox') },
    notificationMail: {
      deliverDue: called('notifications'),
      purgeBefore: purged('notification log'),
    },
    badges: { checkCrowns: called('crowns') },
    moderation: { purgeHandledBefore: purged('reports') },
    liveCodes: { purge: called('live codes') },
    settings: { refresh: called('settings') },
  }
}

function job(
  name: JobName,
  everyMs: number,
  run: () => Promise<unknown> = () => Promise.resolve(),
): NamedJob {
  return { name, everyMs, run }
}

describe('scheduledJobs (ADR 0049)', () => {
  it('purges handled reports past their retention (R-MOD-11)', async () => {
    const config = defaultConfig()
    const deps = recordingDeps()
    const reports = scheduledJobs(config, deps, () => now).find(
      (each) => each.name === 'report retention',
    )

    await reports?.run()

    expect(reports?.everyMs).toBe(config.outboxPurgeIntervalHours * HOUR)
    expect(deps.cutoffs.get('reports')).toEqual(
      retentionCutoff(now, config.limits.reportRetentionDays),
    )
  })

  it('purges the outbound log and notifications by their own retention', async () => {
    const config = defaultConfig()
    const deps = recordingDeps()

    for (const each of scheduledJobs(config, deps, () => now)) await each.run()

    expect(deps.cutoffs.get('outbox')).toEqual(
      retentionCutoff(now, config.limits.outboxRetentionDays),
    )
    expect(deps.cutoffs.get('notification log')).toEqual(
      retentionCutoff(now, config.limits.notificationRetentionDays),
    )
  })

  it('mails notifications on every tick and does the rest on its interval', () => {
    const config = defaultConfig()
    const intervals = Object.fromEntries(
      scheduledJobs(config, recordingDeps()).map((each) => [
        each.name,
        each.everyMs,
      ]),
    )

    expect(intervals).toEqual({
      'notification worker': 0,
      'crown check': config.badgeCrownCheckMinutes * 60_000,
      'erasure sweep': config.erasureSweepIntervalHours * HOUR,
      'token purge': config.tokenPurgeIntervalHours * HOUR,
      'live-code clean-up': config.tokenPurgeIntervalHours * HOUR,
      'outbox retention': config.outboxPurgeIntervalHours * HOUR,
      'notification retention': config.outboxPurgeIntervalHours * HOUR,
      'report retention': config.outboxPurgeIntervalHours * HOUR,
    })
  })
})

describe('timerJobs (ADR 0031, ADR 0049)', () => {
  it('runs every scheduled job, and refreshes the settings a tick leaves to requests', async () => {
    const config = defaultConfig()
    const deps = recordingDeps()
    const jobs = timerJobs(config, deps)

    for (const each of jobs) await each.run()

    expect(deps.calls).toEqual([
      'notifications',
      'crowns',
      'erasure',
      'tokens',
      'live codes',
      'outbox',
      'notification log',
      'reports',
      'settings',
    ])
    expect(jobs.find((each) => each.name === 'settings refresh')?.everyMs).toBe(
      config.settingsRefreshSeconds * 1000,
    )
  })
})

describe('startEvery', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs every job at once, so a restart never delays one, then on its interval', async () => {
    const hourly = vi.fn(() => Promise.resolve())
    const often = vi.fn(() => Promise.resolve())
    const stop = startEvery(
      [
        job('erasure sweep', HOUR, hourly),
        job('notification worker', 0, often),
      ],
      { everyTickMs: 60_000, onError: vi.fn() },
    )

    expect(hourly).toHaveBeenCalledTimes(1)
    expect(often).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(HOUR)
    expect(hourly).toHaveBeenCalledTimes(2)
    expect(often).toHaveBeenCalledTimes(61)
    stop()
  })

  it('runs every job of the timer list, the report purge among them (R-MOD-11)', async () => {
    const config = defaultConfig()
    const deps = recordingDeps()
    const stop = startEvery(timerJobs(config, deps), {
      everyTickMs: config.notificationWorker.intervalSeconds * 1000,
      onError: vi.fn(),
    })
    await vi.advanceTimersByTimeAsync(0)

    expect(new Set(deps.calls)).toEqual(
      new Set([
        'notifications',
        'crowns',
        'erasure',
        'tokens',
        'live codes',
        'outbox',
        'notification log',
        'reports',
        'settings',
      ]),
    )
    stop()
  })

  it('reports a failed run by its job name and keeps its schedule', async () => {
    const onError = vi.fn()
    const failing = vi.fn(() => Promise.reject(new Error('db down')))
    const stop = startEvery([job('report retention', HOUR, failing)], {
      everyTickMs: 60_000,
      onError,
    })
    await vi.advanceTimersByTimeAsync(HOUR)

    expect(failing).toHaveBeenCalledTimes(2)
    expect(onError).toHaveBeenCalledTimes(2)
    expect(onError).toHaveBeenCalledWith('report retention', expect.any(Error))
    stop()
  })

  it('starts no run of a job while its last one is still going', async () => {
    let finish: () => void = () => undefined
    const slow = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const stop = startEvery([job('notification worker', 0, slow)], {
      everyTickMs: 60_000,
      onError: vi.fn(),
    })

    await vi.advanceTimersByTimeAsync(120_000)
    expect(slow).toHaveBeenCalledTimes(1)
    finish()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(slow).toHaveBeenCalledTimes(2)
    stop()
  })

  it('runs nothing more once stopped', async () => {
    const run = vi.fn(() => Promise.resolve())
    const stop = startEvery([job('token purge', HOUR, run)], {
      everyTickMs: 60_000,
      onError: vi.fn(),
    })

    stop()
    await vi.advanceTimersByTimeAsync(HOUR)

    expect(run).toHaveBeenCalledTimes(1)
  })
})
