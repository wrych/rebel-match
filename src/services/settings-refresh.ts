import type { SettingsService } from './settings.js'

const MS_PER_SECOND = 1000

export interface SettingsRefreshDeps {
  settings: Pick<SettingsService, 'refresh'>
  intervalSeconds: number
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

/** Re-reads the hosts' changes on every interval, so a change saved on another
 * server applies here within one interval (ADR 0031). A failed read is
 * reported and the values in force stay. Returns a stop function. */
export function startSettingsRefresh(deps: SettingsRefreshDeps): () => void {
  return (deps.schedule ?? everyInterval)(() => {
    deps.settings.refresh().catch(deps.onError)
  }, deps.intervalSeconds * MS_PER_SECOND)
}
