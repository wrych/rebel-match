import type { BadgeService } from './badges.js'

const MS_PER_MINUTE = 60_000

/** Checks every crown against counts that fell with nobody acting, now and
 * then on every interval (R-BADGE-3). A failed run is reported and the next
 * one still happens. Returns a stop function. */
export function startCrownCheck(deps: {
  badges: Pick<BadgeService, 'checkCrowns'>
  intervalMinutes: number
  onError: (error: unknown) => void
  schedule?: (run: () => void, everyMs: number) => () => void
}): () => void {
  const check = (): void => {
    deps.badges.checkCrowns().catch(deps.onError)
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

  check()
  return every(check, deps.intervalMinutes * MS_PER_MINUTE)
}
