/** One piece of scheduled work: run at most once per `everyMs`, or on every
 * tick when it is 0. */
export interface ScheduledJob {
  run(): Promise<unknown>
  everyMs: number
}

export interface Tick {
  /** Runs the jobs that are due; false when one of them failed. A tick that
   * arrives while one runs shares its outcome. */
  run(): Promise<boolean>
}

/** The scheduled work driven from outside, one call at a time (ADR 0048). A
 * job is due on the first tick, then once its interval has passed since it
 * last started; a failed job is reported and waits for its next turn. */
export function createTick(deps: {
  jobs: readonly ScheduledJob[]
  now?: () => number
  onError: (error: unknown) => void
}): Tick {
  const now = deps.now ?? Date.now
  const lastStarted = new Map<ScheduledJob, number>()
  let running: Promise<boolean> | null = null

  const due = (job: ScheduledJob, at: number): boolean => {
    const last = lastStarted.get(job)
    return last === undefined || at - last >= job.everyMs
  }

  const runDue = async (): Promise<boolean> => {
    const at = now()
    const outcomes = await Promise.all(
      deps.jobs
        .filter((job) => due(job, at))
        .map(async (job) => {
          lastStarted.set(job, at)
          try {
            await job.run()
            return true
          } catch (error) {
            deps.onError(error)
            return false
          }
        }),
    )
    return outcomes.every(Boolean)
  }

  return {
    run: () => {
      running ??= runDue().finally(() => {
        running = null
      })
      return running
    },
  }
}
