import type { Mailer } from './mailer.js'
import { renderNotice } from './notice-mail.js'

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
  /** Where the hosts are, so the time reads as their clock shows it. */
  timeZone: string
}): (note: ApplicantNote) => Promise<void> {
  const time = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: deps.timeZone,
    timeZoneName: 'short',
  })
  return async (note) => {
    await deps.mailer.send({
      memberId: note.reviewerId,
      aboutMemberId: note.applicantId,
      to: note.to,
      kind: 'admin_notice',
      subject: 'Someone asked to join Rebel Match',
      ...renderNotice(deps.publicUrl, 'applicant', {
        heading: 'Someone asked to join',
        preview: `${note.applicantEmail} asked for access.`,
        text: `${note.applicantEmail} asked for access on ${time.format(note.at)}.`,
        action: {
          label: 'Review applicants',
          prompt: 'Approve or reject them here:',
          path: '/admin/applicants',
        },
      }),
    })
  }
}
