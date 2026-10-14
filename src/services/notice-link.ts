import type { NotificationKind } from './notifications.js'

/** A link in a notification's email, marked with the notification's kind so
 * that the app can report it opened from an email (R-ANA-1, R-NAV-9). */
export function noticeLink(
  publicUrl: string,
  path: string,
  kind: NotificationKind,
): string {
  const url = new URL(path, publicUrl)
  url.searchParams.set('notice', kind)
  return url.toString()
}
