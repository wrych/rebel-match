import type { Config } from '../config.js'
import { MS_PER_MINUTE } from '../time.js'
import { retentionCutoff } from './outbox-log.js'
import type { ScheduledJob } from './tick.js'

const MS_PER_SECOND = 1000
const MS_PER_HOUR = 3_600_000

export type JobName =
  | 'notification worker'
  | 'crown check'
  | 'erasure sweep'
  | 'token purge'
  | 'live-code clean-up'
  | 'outbox retention'
  | 'notification retention'
  | 'report retention'
  | 'settings refresh'

/** A scheduled job with the name its failure is reported under; the name
 * carries no member data. */
export interface NamedJob extends ScheduledJob {
  name: JobName
}

interface Purgeable {
  purgeBefore(cutoff: Date): Promise<unknown>
}

/** What the scheduled work acts on. */
export interface ScheduledDeps {
  auth: { purgeExpired(): Promise<unknown> }
  erasure: { eraseDue(): Promise<unknown> }
  outbox: Purgeable
  notificationMail: Purgeable & { deliverDue(): Promise<unknown> }
  badges: { checkCrowns(): Promise<unknown> }
  moderation: { purgeHandledBefore(cutoff: Date): Promise<unknown> }
  liveCodes: { purge(): Promise<unknown> }
}

/** What the server's own timers act on: the scheduled work and the settings. */
export interface TimerDeps extends ScheduledDeps {
  settings: { refresh(): Promise<unknown> }
}

type ScheduledConfig = Pick<
  Config,
  | 'badgeCrownCheckMinutes'
  | 'erasureSweepIntervalHours'
  | 'tokenPurgeIntervalHours'
  | 'outboxPurgeIntervalHours'
  | 'settingsRefreshSeconds'
> & {
  limits: Pick<
    Config['limits'],
    'outboxRetentionDays' | 'notificationRetentionDays' | 'reportRetentionDays'
  >
}

// What is kept only so long: the outbound log, notifications and handled
// reports (R-MSG-6, R-NOTE-11, R-MOD-11).
function retentionJobs(
  config: ScheduledConfig,
  deps: ScheduledDeps,
  now: () => Date,
): NamedJob[] {
  const everyMs = config.outboxPurgeIntervalHours * MS_PER_HOUR
  const purge = (log: Purgeable, days: number) => (): Promise<unknown> =>
    log.purgeBefore(retentionCutoff(now(), days))
  return [
    {
      name: 'outbox retention',
      run: purge(deps.outbox, config.limits.outboxRetentionDays),
      everyMs,
    },
    {
      name: 'notification retention',
      run: purge(
        deps.notificationMail,
        config.limits.notificationRetentionDays,
      ),
      everyMs,
    },
    {
      name: 'report retention',
      run: purge(
        { purgeBefore: (cutoff) => deps.moderation.purgeHandledBefore(cutoff) },
        config.limits.reportRetentionDays,
      ),
      everyMs,
    },
  ]
}

/** The scheduled work, the same whether a tick or the server's timers run it
 * (ADR 0049): notifications on every turn, the rest on its interval. */
export function scheduledJobs(
  config: ScheduledConfig,
  deps: ScheduledDeps,
  now: () => Date = () => new Date(),
): NamedJob[] {
  return [
    {
      name: 'notification worker',
      run: () => deps.notificationMail.deliverDue(),
      everyMs: 0,
    },
    {
      name: 'crown check',
      run: () => deps.badges.checkCrowns(),
      everyMs: config.badgeCrownCheckMinutes * MS_PER_MINUTE,
    },
    {
      name: 'erasure sweep',
      run: () => deps.erasure.eraseDue(),
      everyMs: config.erasureSweepIntervalHours * MS_PER_HOUR,
    },
    {
      name: 'token purge',
      run: () => deps.auth.purgeExpired(),
      everyMs: config.tokenPurgeIntervalHours * MS_PER_HOUR,
    },
    {
      name: 'live-code clean-up',
      run: () => deps.liveCodes.purge(),
      everyMs: config.tokenPurgeIntervalHours * MS_PER_HOUR,
    },
    ...retentionJobs(config, deps, now),
  ]
}

/** The scheduled work plus the settings refresh, which a tick leaves to the
 * request path (ADR 0031, ADR 0049). */
export function timerJobs(
  config: ScheduledConfig,
  deps: TimerDeps,
): NamedJob[] {
  return [
    ...scheduledJobs(config, deps),
    {
      name: 'settings refresh',
      run: () => deps.settings.refresh(),
      everyMs: config.settingsRefreshSeconds * MS_PER_SECOND,
    },
  ]
}

/** Runs each job now and then on its own timer, a job that runs on every tick
 * every `everyTickMs`; a run is skipped while the job's last one goes on, and
 * a failure goes to `onError` by name. Returns a stop function. */
export function startEvery(
  jobs: readonly NamedJob[],
  options: {
    everyTickMs: number
    onError: (name: JobName, error: unknown) => void
  },
): () => void {
  const timers = jobs.map((job) => {
    let running = false
    const run = (): void => {
      if (running) return
      running = true
      job
        .run()
        .catch((error: unknown) => {
          options.onError(job.name, error)
        })
        .finally(() => {
          running = false
        })
    }
    run()
    const timer = setInterval(
      run,
      job.everyMs === 0 ? options.everyTickMs : job.everyMs,
    )
    timer.unref()
    return timer
  })
  return () => {
    for (const timer of timers) clearInterval(timer)
  }
}
