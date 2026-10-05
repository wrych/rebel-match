import type { ErasureService } from './erasure.js'

const MS_PER_HOUR = 3_600_000

/** Erases deleted accounts whose grace period has passed, now and then on
 * every interval (ADR 0032). A failed run is reported and the next one still
 * happens. Returns a stop function. */
export function startErasureSweep(deps: {
  erasure: Pick<ErasureService, 'eraseDue'>
  intervalHours: number
  onError: (error: unknown) => void
  schedule?: (run: () => void, everyMs: number) => () => void
}): () => void {
  const sweep = (): void => {
    deps.erasure.eraseDue().catch(deps.onError)
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

  sweep()
  return every(sweep, deps.intervalHours * MS_PER_HOUR)
}
