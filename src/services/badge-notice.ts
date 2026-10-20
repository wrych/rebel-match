import type { Mailer } from './mailer.js'
import { noticeLink } from './notice-link.js'

/** One member's notification of a badge they gained. */
export interface BadgeNote {
  recipientId: string
  to: string
  /** The badge's name, and the row it belongs to as the screens call it. */
  name: string
  rowTitle: string
  /** The row's screen, where the badge is seen. */
  path: string
  crown: boolean
}

/** What a gained badge's mail and digest line say: its name, its row and
 * whether it is a crown, and nothing about anyone else (R-BADGE-10). */
export function badgeLine(
  note: Pick<BadgeNote, 'name' | 'rowTitle' | 'crown'>,
): string {
  return note.crown
    ? `You hold the crown of ${note.rowTitle}: ${note.name}.`
    : `You earned a new badge in ${note.rowTitle}: ${note.name}.`
}

/** Emails a member the badge they gained, with a link to its row; the entry
 * goes with the member (R-BADGE-10, R-MSG-6). */
export function createBadgeNotice(deps: {
  mailer: Mailer
  publicUrl: string
}): (note: BadgeNote) => Promise<void> {
  return async (note) => {
    await deps.mailer.send({
      memberId: note.recipientId,
      to: note.to,
      kind: 'badge',
      subject: `New badge on Rebel Match: ${note.name}`,
      text:
        `${badgeLine(note)}\n\n` +
        `See your badges here:\n${noticeLink(deps.publicUrl, note.path, 'badge')}\n`,
    })
  }
}
