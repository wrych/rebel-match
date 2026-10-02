import type { Mailer } from './mailer.js'

export interface ReviewerDirectory {
  /** Addresses of active members holding any of these roles. */
  emailsHolding(roles: readonly string[]): Promise<string[]>
}

/** Emails every member who can review applicants about a new one (R-AUTH-2,
 * R-AUTH-11), found by permission, never by role name (R-ROLE-3). */
export function createApplicantNotice(deps: {
  mailer: Mailer
  reviewers: ReviewerDirectory
  reviewerRoles: readonly string[]
  publicUrl: string
  now?: () => Date
}): (applicantEmail: string) => Promise<void> {
  return async (applicantEmail) => {
    const at = (deps.now ?? (() => new Date()))().toISOString()
    const review = new URL('/admin/applicants', deps.publicUrl).toString()

    for (const to of await deps.reviewers.emailsHolding(deps.reviewerRoles)) {
      await deps.mailer.send({
        memberId: null,
        to,
        kind: 'admin_notice',
        subject: 'Someone asked to join Rebel Match',
        text:
          `${applicantEmail} asked for access at ${at}.\n\n` +
          `Approve or reject them here:\n${review}\n`,
      })
    }
  }
}
