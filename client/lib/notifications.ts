import type { NotificationView } from '../../src/services/notifications'

export type { NotificationView }

/** The member's notifications, newest first, a page at a time; with
 * `before`, the page after that entry (R-NOTE-5). */
export async function fetchNotifications(
  before?: string,
): Promise<NotificationView[]> {
  const query =
    before === undefined ? '' : `?before=${encodeURIComponent(before)}`
  const response = await fetch(`/api/notifications${query}`)
  if (!response.ok)
    throw new Error(`notifications unavailable (${String(response.status)})`)
  return ((await response.json()) as { notifications: NotificationView[] })
    .notifications
}

/** Heard by the menu, so its badge clears as soon as the screen marked what
 * it listed (R-NOTE-6). */
export const NOTIFICATIONS_SEEN = 'notifications-seen'

/** Records that the screen listed these, so they are no longer new
 * (R-NOTE-5). */
export async function markNotificationsSeen(
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return
  const response = await fetch('/api/notifications/seen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
  if (!response.ok)
    throw new Error(`notifications not marked (${String(response.status)})`)
  window.dispatchEvent(new Event(NOTIFICATIONS_SEEN))
}

/** How many are new, for the menu; anything but a positive whole number, or
 * a failed read, counts as none (R-NOTE-6). */
export async function fetchNewNotifications(): Promise<number> {
  const response = await fetch('/api/notifications/new')
  if (!response.ok) return 0
  const { count } = (await response.json()) as { count?: unknown }
  return typeof count === 'number' && Number.isInteger(count) && count > 0
    ? count
    : 0
}

/** What happened, in one line, naming who it is about (R-NOTE-5). */
export function headline(note: NotificationView): string {
  switch (note.kind) {
    case 'connection_request':
      return `${note.name} wants to connect with you`
    case 'connection_accepted':
      return `${note.name} accepted your request`
    case 'connection_added':
      return `${note.name} connected with you over another challenge`
    case 'applicant':
      return `${note.name} asked to join`
  }
}

/** The menu item's words: the count only while something is new (R-NOTE-6). */
export function menuLabel(count: number): string {
  return count > 0 ? `Notifications (${String(count)} new)` : 'Notifications'
}
