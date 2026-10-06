import { noteInviteOpened } from './admission'

/** What counts as a person touching the entry screen: a press of mouse,
 * finger or pen, or a key. A link scanner loads the page and runs its script
 * but presses nothing (ADR 0039). */
const FIRST_TOUCH = ['pointerdown', 'keydown'] as const

const COUNTED_KEY = 'rm_invite_counted'

/** Counts an open of `invite` on the visitor's first press or key while the
 * tab is visible, once per tab, and never in a browser that declares itself
 * automated (R-STAT-6, ADR 0039). Returns the function that stops listening,
 * for a screen that leaves first. */
export function countInviteOpen(invite: string): () => void {
  const stop = (): void => {
    for (const type of FIRST_TOUCH)
      window.removeEventListener(type, onFirstTouch, true)
  }
  function onFirstTouch(): void {
    if (document.visibilityState !== 'visible') return
    stop()
    remember(invite)
    noteInviteOpened(invite)
  }
  if (navigator.webdriver || counted(invite)) return () => undefined
  for (const type of FIRST_TOUCH)
    window.addEventListener(type, onFirstTouch, {
      capture: true,
      passive: true,
    })
  return stop
}

/** Storage can be refused; the open then counts again on the next load in
 * the same tab, which is the lesser loss. */
function counted(invite: string): boolean {
  try {
    return sessionStorage.getItem(COUNTED_KEY) === invite
  } catch {
    return false
  }
}

function remember(invite: string): void {
  try {
    sessionStorage.setItem(COUNTED_KEY, invite)
  } catch {
    // counted without being remembered; see `counted`
  }
}
