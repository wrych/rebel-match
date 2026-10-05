/** Whether the page is in view, and word when it comes back into view. */
export interface Page {
  hidden(): boolean
  /** Calls `listener` whenever the page becomes visible; returns a stop. */
  onShown(listener: () => void): () => void
}

/** The browser tab the app runs in. */
export const browserPage: Page = {
  hidden: () => document.hidden,
  onShown: (listener) => {
    const changed = (): void => {
      if (!document.hidden) listener()
    }
    document.addEventListener('visibilitychange', changed)
    return () => {
      document.removeEventListener('visibilitychange', changed)
    }
  },
}

/** Calls `refresh` every `everyMs` while the page is visible, and at once when
 * it comes back into view, so nothing goes stale in a background tab
 * (R-MINE-4). Returns a function that stops it. */
export function poll(
  refresh: () => void,
  everyMs: number,
  page: Page = browserPage,
): () => void {
  const timer = setInterval(() => {
    if (!page.hidden()) refresh()
  }, everyMs)
  const stopListening = page.onShown(refresh)
  return () => {
    clearInterval(timer)
    stopListening()
  }
}
