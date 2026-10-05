import { describe, expect, it } from 'vitest'
import type { OutgoingLink } from '../auth/index.js'
import { mailLinks } from './link-delivery.js'
import type { DeliveryStatus, Mailer, OutboundMessage } from './mailer.js'

function recordingMailer(status: DeliveryStatus): Mailer & {
  sent: OutboundMessage[]
} {
  const sent: OutboundMessage[] = []
  return {
    sent,
    send: (message) => {
      sent.push(message)
      return Promise.resolve(status)
    },
  }
}

const link: OutgoingLink = {
  memberId: 'm1',
  email: 'ada@example.invalid',
  kind: 'self_service',
  url: 'https://match.example.org/auth/verify?token=t',
}

describe('mailLinks', () => {
  it('sends a magic link to the member, marking the link as the credential', async () => {
    const mailer = recordingMailer('sent')

    await mailLinks(mailer)(link)

    expect(mailer.sent[0]).toMatchObject({
      memberId: 'm1',
      to: 'ada@example.invalid',
      kind: 'magic_link',
      credential: link.url,
    })
    expect(mailer.sent[0]?.text).toContain(link.url)
  })

  it('sends an approval link as an approval, saying so (R-AUTH-10)', async () => {
    const mailer = recordingMailer('sent')

    await mailLinks(mailer)({ ...link, kind: 'approval' })

    expect(mailer.sent[0]?.kind).toBe('approval')
    expect(mailer.sent[0]?.text).toMatch(/approved/)
  })

  it('sends a keep-it link with the erasure date (ADR 0032)', async () => {
    const mailer = recordingMailer('sent')

    await mailLinks(mailer)({
      ...link,
      kind: 'restore',
      eraseAfter: new Date('2026-11-04T10:00:00Z'),
    })

    expect(mailer.sent[0]).toMatchObject({
      kind: 'magic_link',
      subject: 'Keep your Rebel Match account?',
      credential: link.url,
    })
    expect(mailer.sent[0]?.text).toContain('erased for good on 4 November 2026')
    expect(mailer.sent[0]?.text).toContain(link.url)
  })

  it('accepts a suppressed send, as in development', async () => {
    await expect(
      mailLinks(recordingMailer('suppressed'))(link),
    ).resolves.toBeUndefined()
  })

  it('fails when the link could not be sent, naming nobody', async () => {
    await expect(mailLinks(recordingMailer('failed'))(link)).rejects.toThrow(
      /^sign-in link could not be sent$/,
    )
  })
})
