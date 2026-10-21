import { describe, expect, it } from 'vitest'
import type { Mailer, OutboundMessage } from './mailer.js'
import { createReportNotice, openReportsWords } from './report-notice.js'

describe('createReportNotice', () => {
  it('emails one host who was reported and where to review it, naming no reporter (R-MOD-5)', async () => {
    const sent: OutboundMessage[] = []
    const mailer: Mailer = {
      send: (message) => {
        sent.push(message)
        return Promise.resolve('suppressed')
      },
    }
    const notify = createReportNotice({
      mailer,
      publicUrl: 'http://localhost:5173',
    })

    await notify({
      reviewerId: 'm-host',
      to: 'host@example.invalid',
      reportedId: 'm-rik',
      reportedName: 'Rik Dalton',
      openReports: 3,
    })

    expect(sent).toEqual([
      {
        memberId: 'm-host',
        aboutMemberId: 'm-rik',
        to: 'host@example.invalid',
        kind: 'admin_notice',
        subject: 'A member was reported on Rebel Match',
        text:
          'Rik Dalton was reported. 3 reports are open about them.\n\n' +
          'Hide what was reported, or dismiss the reports, here:\n' +
          'http://localhost:5173/admin/moderation/m-rik?notice=report\n\n' +
          'You get this email because you are a Rebel Match member.\n\n' +
          'Choose how each kind of notification reaches you on your profile:\n' +
          'http://localhost:5173/profile\n',
        html: expect.stringContaining('Review the reports') as string,
      },
    ])
  })

  it.each([
    [1, '1 report is open'],
    [2, '2 reports are open'],
  ])('words %i open as %s', (n, words) => {
    expect(openReportsWords(n)).toBe(words)
  })
})
