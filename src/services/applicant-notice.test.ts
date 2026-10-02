import { describe, expect, it } from 'vitest'
import { createApplicantNotice } from './applicant-notice.js'
import type { Mailer, OutboundMessage } from './mailer.js'

function setup(reviewers: string[]): {
  notify: (email: string) => Promise<void>
  sent: OutboundMessage[]
  askedFor: (readonly string[])[]
} {
  const sent: OutboundMessage[] = []
  const askedFor: (readonly string[])[] = []
  const mailer: Mailer = {
    send: (message) => {
      sent.push(message)
      return Promise.resolve('suppressed')
    },
  }
  const notify = createApplicantNotice({
    mailer,
    reviewers: {
      emailsHolding: (roles) => {
        askedFor.push(roles)
        return Promise.resolve(reviewers)
      },
    },
    reviewerRoles: ['admin'],
    publicUrl: 'http://localhost:5173',
    now: () => new Date('2026-11-08T10:00:00Z'),
  })
  return { notify, sent, askedFor }
}

describe('createApplicantNotice', () => {
  it('tells every reviewer who asked, and when (R-AUTH-2, R-AUTH-11)', async () => {
    const { notify, sent, askedFor } = setup([
      'a@example.invalid',
      'b@example.invalid',
    ])

    await notify('new@example.invalid')

    expect(askedFor).toEqual([['admin']])
    expect(sent.map((message) => message.to)).toEqual([
      'a@example.invalid',
      'b@example.invalid',
    ])
    expect(sent[0]).toMatchObject({ kind: 'admin_notice', memberId: null })
    expect(sent[0]?.text).toContain('new@example.invalid')
    expect(sent[0]?.text).toContain('2026-11-08T10:00:00.000Z')
    expect(sent[0]?.text).toContain('http://localhost:5173/admin/applicants')
  })

  it('sends nothing when nobody can review', async () => {
    const { notify, sent } = setup([])

    await notify('new@example.invalid')

    expect(sent).toEqual([])
  })
})
