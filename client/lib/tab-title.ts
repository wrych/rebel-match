import { pageTitle } from '../../src/routes'

let screen: string | null = null
let unread = 0

/** A tab title led by the number of new notifications, when there are any
 * (R-NAV-13, R-NOTE-6). */
export function tabTitle(screenTitle: string, newCount: number): string {
  const title = pageTitle(screenTitle)
  return newCount > 0 ? `(${String(newCount)}) ${title}` : title
}

// Nothing is written before the router names a screen, so a count read first
// never leaves the tab titled with no screen.
function render(): void {
  if (screen !== null) document.title = tabTitle(screen, unread)
}

/** Names the screen now shown in the tab (R-NAV-13). */
export function showScreen(title: string): void {
  screen = title
  render()
}

/** Puts the number of new notifications in front of the tab title (R-NOTE-6). */
export function showUnread(count: number): void {
  unread = count
  render()
}
