import type { Mailer } from './mailer.js'
import { renderNotice } from './notice-mail.js'
import { pathTo } from '../routes.js'

/** One host's notification of reports about one member. */
export interface ReportNote {
  reviewerId: string
  to: string
  reportedId: string
  reportedName: string
  openReports: number
}

/** The words for how many reports wait, shared by the email and the digest
 * entry. */
export const openReportsWords = (n: number): string =>
  `${String(n)} ${n === 1 ? 'report is' : 'reports are'} open`

/** Emails one host about a member who was reported (R-MOD-5). It names the
 * member and how many reports are open, never who reported them or what was
 * said (R-NAV-9); the entry is erased with the member it names (R-MSG-6). */
export function createReportNotice(deps: {
  mailer: Mailer
  publicUrl: string
}): (note: ReportNote) => Promise<void> {
  return async (note) => {
    const open = openReportsWords(note.openReports)
    await deps.mailer.send({
      memberId: note.reviewerId,
      aboutMemberId: note.reportedId,
      to: note.to,
      kind: 'admin_notice',
      subject: 'A member was reported on Rebel Match',
      ...renderNotice(deps.publicUrl, 'report', {
        heading: 'A member was reported',
        preview: `${note.reportedName} was reported; ${open}.`,
        text: `${note.reportedName} was reported. ${open} about them.`,
        action: {
          label: 'Review the reports',
          prompt: 'Hide what was reported, or dismiss the reports, here:',
          path: pathTo('admin-moderated-member', {
            memberId: note.reportedId,
          }),
        },
      }),
    })
  }
}
