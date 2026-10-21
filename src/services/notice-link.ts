import type { MailContent } from './mail-layout.js'
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

/** The foot of a notification's email: why it came, and where a member
 * chooses how notifications reach them (R-MSG-8, R-NOTE-2). */
export function noticeFooter(publicUrl: string): MailContent['footer'] {
  return {
    reason: 'You get this email because you are a Rebel Match member.',
    settings: new URL('/profile', publicUrl).toString(),
  }
}
