import { RECAP_TITLE } from '../recap/title.js'
import { renderMail, type MailItem } from './mail-layout.js'
import type { Mailer } from './mailer.js'
import { noticeFooter, noticeLink } from './notice-link.js'

/** Where the recap is seen. */
export const RECAP_PATH = '/recap'

/** What the recap's notice says: that the member's own record is ready, and
 * nothing about anyone (R-RECAP-9). */
export const recapLine = `${RECAP_TITLE} is ready: the summit, as you lived it.`

/** The recap's line in a digest, with its link (R-NOTE-8). */
export function recapItem(publicUrl: string): MailItem {
  return {
    text: recapLine,
    action: {
      label: `See ${RECAP_TITLE.toLowerCase()}`,
      url: noticeLink(publicUrl, RECAP_PATH, 'recap'),
    },
  }
}

/** Emails a member that their summit recap is open, with a link to it; the
 * entry goes with the member (R-RECAP-9, R-MSG-6). */
export function createRecapNotice(deps: {
  mailer: Mailer
  publicUrl: string
}): (note: { recipientId: string; to: string }) => Promise<void> {
  return async (note) => {
    await deps.mailer.send({
      memberId: note.recipientId,
      to: note.to,
      kind: 'recap',
      subject: `${RECAP_TITLE} is ready`,
      ...renderMail({
        heading: `${RECAP_TITLE} is ready`,
        preview: recapLine,
        blocks: [
          {
            kind: 'paragraph',
            text: 'The summit is over. Here is what you made of it: what you posted, who you helped, who you connected with, and where you stand in the movement, ready to share.',
          },
          {
            kind: 'action',
            action: {
              label: `See ${RECAP_TITLE.toLowerCase()}`,
              prompt: `See ${RECAP_TITLE.toLowerCase()} here:`,
              url: noticeLink(deps.publicUrl, RECAP_PATH, 'recap'),
            },
          },
        ],
        footer: noticeFooter(deps.publicUrl),
      }),
    })
  }
}
