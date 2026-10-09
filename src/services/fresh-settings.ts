import type { SettingsService } from './settings.js'

const MS_PER_SECOND = 1000

/** Re-reads the hosts' changes when the copy in force is older than
 * `maxAgeSeconds`, for servers that run no refresh timer (ADR 0031,
 * ADR 0048). Concurrent callers share one read; a failed read is reported
 * and the values in force stay. */
export function createFreshSettings(deps: {
  settings: Pick<SettingsService, 'refresh'>
  maxAgeSeconds: number
  now?: () => number
  onError: (error: unknown) => void
}): () => Promise<void> {
  const now = deps.now ?? Date.now
  let readAt: number | undefined
  let reading: Promise<void> | null = null

  const stale = (): boolean =>
    readAt === undefined || now() - readAt >= deps.maxAgeSeconds * MS_PER_SECOND

  return () => {
    if (reading === null && stale()) {
      readAt = now()
      reading = deps.settings
        .refresh()
        .catch(deps.onError)
        .finally(() => {
          reading = null
        })
    }
    return reading ?? Promise.resolve()
  }
}
