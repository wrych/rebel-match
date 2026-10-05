import type { AuthProvider } from '../auth/index.js'

const MS_PER_HOUR = 3_600_000

/** Deletes expired sessions and sign-in tokens, now and then on every interval
 * (ADR 0034). A failed run is reported and the next one still happens.
 * Returns a stop function. */
export function startTokenPurge(deps: {
  auth: Pick<AuthProvider, 'purgeExpired'>
  intervalHours: number
  onError: (error: unknown) => void
  schedule?: (run: () => void, everyMs: number) => () => void
}): () => void {
  const purge = (): void => {
    deps.auth.purgeExpired().catch(deps.onError)
  }
  const every =
    deps.schedule ??
    ((run: () => void, everyMs: number): (() => void) => {
      const timer = setInterval(run, everyMs)
      timer.unref()
      return () => {
        clearInterval(timer)
      }
    })

  purge()
  return every(purge, deps.intervalHours * MS_PER_HOUR)
}
