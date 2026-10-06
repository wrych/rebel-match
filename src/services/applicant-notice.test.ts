import { describe, expect, it } from 'vitest'
import { createApplicantNotice } from './applicant-notice.js'
import type { Mailer, OutboundMessage } from './mailer.js'

describe('createApplicantNotice', () => {
  it('emails one reviewer who asked, when, and where to answer (R-AUTH-2, R-AUTH-11)', async () => {
    const sent: OutboundMessage[] = []
    const mailer: Mailer = {
      send: (message) => {
        sent.push(message)
        return Promise.resolve('suppressed')
      },
    }
    const notify = createApplicantNotice({
      mailer,
      publicUrl: 'http://localhost:5173',
    })

    await notify({
      reviewerId: 'm-host',
      to: 'host@example.invalid',
      applicantId: 'm-new',
      applicantEmail: 'new@example.invalid',
      at: new Date('2026-11-08T10:00:00Z'),
    })

    expect(sent).toEqual([
      {
        memberId: 'm-host',
        aboutMemberId: 'm-new',
        to: 'host@example.invalid',
        kind: 'admin_notice',
        subject: 'Someone asked to join Rebel Match',
        text:
          'new@example.invalid asked for access at 2026-11-08T10:00:00.000Z.\n\n' +
          'Approve or reject them here:\nhttp://localhost:5173/admin/applicants\n',
      },
    ])
  })
})
