export interface RecapAnnounceStore {
  /** Whether members were told already. */
  announced(): Promise<boolean>
  /** Tells every active, onboarded member once, recording that it is done;
   * false when it was done already. */
  announceOnce(at: Date): Promise<boolean>
}

export interface RecapAnnouncer {
  /** Tells every member their record is ready, the first time it finds the
   * recap open; true when it did now (R-RECAP-9). */
  announce(): Promise<boolean>
}

/** The recap's announcement, checked on every run of the notification
 * worker: cheap while the recap is closed, since nothing is read, and once
 * only, whatever the switch does after (R-RECAP-9, ADR 0060). */
export function createRecapAnnouncer(deps: {
  store: RecapAnnounceStore
  open: () => boolean
  now?: () => Date
}): RecapAnnouncer {
  const now = deps.now ?? ((): Date => new Date())
  let done = false
  return {
    announce: async () => {
      if (done || !deps.open()) return false
      if (await deps.store.announced()) {
        done = true
        return false
      }
      // Marked done only once it stands, so a failed run tries again.
      const told = await deps.store.announceOnce(now())
      done = true
      return told
    },
  }
}
