const KEY = 'stale-chunk-reload'

// How Chrome, Safari and Firefox word a lazily loaded file that would not
// load, and how Vite words a stylesheet that would not.
const STALE =
  /dynamically imported module|Importing a module script failed|Unable to preload CSS/i

/** Whether a navigation failed because a lazily loaded screen's file is gone,
 * as after a deploy while the tab stayed open. */
export const isStaleChunk = (error: unknown): boolean =>
  error instanceof Error && STALE.test(error.message)

/** Loads the page afresh at `path` after a stale chunk, once per path, so a
 * file that is truly missing cannot reload the page in a loop. Returns
 * whether it reloads. */
export function reloadForStaleChunk(
  path: string,
  go: (path: string) => void = (to) => {
    window.location.assign(to)
  },
): boolean {
  try {
    if (sessionStorage.getItem(KEY) === path) return false
    sessionStorage.setItem(KEY, path)
  } catch {
    return false
  }
  go(path)
  return true
}

/** Forgets the last reload once a navigation has gone through. */
export function settledAfterReload(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Without storage there is nothing to forget.
  }
}
