import { MS_PER_MINUTE } from '../time.js'

/** Counts uses per key within a fixed window, in this server's memory only
 * (ADR 0029): a restart forgets them, and each instance counts on its own. */
export interface WindowCounter {
  /** Uses of `key` in its current window. */
  count(key: string): number
  /** Counts one use of `key`. */
  add(key: string): void
  /** Takes back one use of `key` counted in its current window. */
  remove(key: string): void
  /** Counts one use of `key` if it has fewer than `limit`; says whether it did. */
  take(key: string, limit: number): boolean
}

interface Window {
  startedAt: number
  uses: number
}

/** A fixed window per key, starting at the key's first use. Windows that have
 * ended are swept once per window length, so the map holds only the keys seen
 * recently, however many visit over a day. */
export function createWindowCounter(options: {
  windowMinutes: number
  now?: () => number
}): WindowCounter {
  const now = options.now ?? Date.now
  const windowMs = options.windowMinutes * MS_PER_MINUTE
  const windows = new Map<string, Window>()
  let nextSweep = now() + windowMs

  const ended = (window: Window, at: number): boolean =>
    at - window.startedAt >= windowMs

  const sweep = (at: number): void => {
    if (at < nextSweep) return
    for (const [key, window] of windows) {
      if (ended(window, at)) windows.delete(key)
    }
    nextSweep = at + windowMs
  }

  const current = (key: string): Window => {
    const at = now()
    sweep(at)
    const window = windows.get(key)
    if (window !== undefined && !ended(window, at)) return window
    const fresh = { startedAt: at, uses: 0 }
    windows.set(key, fresh)
    return fresh
  }

  return {
    count: (key) => {
      const window = windows.get(key)
      return window === undefined || ended(window, now()) ? 0 : window.uses
    },
    add: (key) => {
      current(key).uses += 1
    },
    remove: (key) => {
      const window = windows.get(key)
      if (window !== undefined && !ended(window, now()) && window.uses > 0)
        window.uses -= 1
    },
    take: (key, limit) => {
      const window = current(key)
      if (window.uses >= limit) return false
      window.uses += 1
      return true
    },
  }
}
