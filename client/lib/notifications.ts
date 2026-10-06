import type { NotificationSetting } from '../../src/services/notification-settings'
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
    case 'trend_challenge':
      return `${note.name} posted a challenge in ${note.trend ?? 'a trend you follow'}`
    case 'applicant':
      return `${note.name} asked to join`
  }
}

/** The menu item's words: the count only while something is new (R-NOTE-6). */
export function menuLabel(count: number): string {
  return count > 0 ? `Notifications (${String(count)} new)` : 'Notifications'
}

export type { NotificationSetting }

/** How each type reaches the member, for the profile screen (R-NOTE-3). */
export async function fetchNotificationSettings(): Promise<
  NotificationSetting[]
> {
  const response = await fetch('/api/me/notification-settings')
  if (!response.ok)
    throw new Error(`settings unavailable (${String(response.status)})`)
  return ((await response.json()) as { settings: NotificationSetting[] })
    .settings
}

/** Records the member's choice for one type (R-NOTE-2). */
export async function chooseNotificationCadence(
  type: string,
  cadence: string,
): Promise<void> {
  const response = await fetch(
    `/api/me/notification-settings/${encodeURIComponent(type)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cadence }),
    },
  )
  if (!response.ok)
    throw new Error(`setting not saved (${String(response.status)})`)
}

const TYPE_LABELS: Record<NotificationSetting['type'], string> = {
  connection_request: 'Requests to connect',
  new_connection: 'New connections',
  trend_challenge: 'New challenges in trends you follow',
  applicant: 'People asking to join',
}

const CADENCE_LABELS: Record<NotificationSetting['cadence'], string> = {
  immediately: 'Immediately',
  every_15_minutes: 'Every 15 minutes',
  hourly: 'Hourly',
  daily: 'Daily',
  in_app: 'In the app only',
  off: 'Off',
}

/** What a type is called on the profile screen. */
export function typeLabel(type: NotificationSetting['type']): string {
  return TYPE_LABELS[type]
}

/** An option as the profile screen offers it, marking the default. */
export function cadenceLabel(
  cadence: NotificationSetting['cadence'],
  defaultCadence: NotificationSetting['cadence'],
): string {
  const label = CADENCE_LABELS[cadence]
  return cadence === defaultCadence ? `${label} (default)` : label
}
