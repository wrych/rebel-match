import { retentionCutoff, type OutboxLog } from './outbox-log.js'

const MS_PER_HOUR = 3_600_000

export interface RetentionDeps {
  log: Pick<OutboxLog, 'purgeBefore'>
  retentionDays: number
  intervalHours: number
  now?: () => Date
  onError: (error: unknown) => void
  schedule?: (run: () => void, everyMs: number) => () => void
}

function everyInterval(run: () => void, everyMs: number): () => void {
  const timer = setInterval(run, everyMs)
  timer.unref()
  return () => {
    clearInterval(timer)
  }
}

/** Purges the outbound log now and then on every interval, so entries never
 * outlive the retention window by more than one interval (R-MSG-6). A failed
 * run is reported and the next one still happens. Returns a stop function. */
export function startOutboxRetention(deps: RetentionDeps): () => void {
  const now = deps.now ?? (() => new Date())
  const purge = (): void => {
    deps.log
      .purgeBefore(retentionCutoff(now(), deps.retentionDays))
      .catch(deps.onError)
  }

  purge()
  return (deps.schedule ?? everyInterval)(
    purge,
    deps.intervalHours * MS_PER_HOUR,
  )
}
