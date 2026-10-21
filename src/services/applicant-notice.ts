import { renderMail } from './mail-layout.js'
import type { Mailer } from './mailer.js'
import { noticeFooter, noticeLink } from './notice-link.js'

/** One reviewer's notification of one applicant. */
export interface ApplicantNote {
  reviewerId: string
  to: string
  applicantId: string
  applicantEmail: string
  /** When they asked. */
  at: Date
}

/** Emails one member who can review applicants about a new one (R-AUTH-2,
 * R-AUTH-11). The worker sends one per reviewer's notification (R-NOTE-7);
 * the entry is erased with the applicant it names (R-MSG-6). */
export function createApplicantNotice(deps: {
  mailer: Mailer
  publicUrl: string
}): (note: ApplicantNote) => Promise<void> {
  const review = noticeLink(deps.publicUrl, '/admin/applicants', 'applicant')
  return async (note) => {
    await deps.mailer.send({
      memberId: note.reviewerId,
      aboutMemberId: note.applicantId,
      to: note.to,
      kind: 'admin_notice',
      subject: 'Someone asked to join Rebel Match',
      ...renderMail({
        heading: 'Someone asked to join',
        preview: `${note.applicantEmail} asked for access.`,
        blocks: [
          {
            kind: 'paragraph',
            text: `${note.applicantEmail} asked for access at ${note.at.toISOString()}.`,
          },
          {
            kind: 'action',
            action: {
              label: 'Review applicants',
              prompt: 'Approve or reject them here:',
              url: review,
            },
          },
        ],
        footer: noticeFooter(deps.publicUrl),
      }),
    })
  }
}
