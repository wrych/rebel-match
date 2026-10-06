import { describe, expect, it } from 'vitest'
import type { ConnectionRecord } from './connections.js'
import type { DeliveryStatus, Mailer, OutboundMessage } from './mailer.js'
import { createNotificationSender } from './notification-mail.js'
import type { DueNotification } from './notification-worker.js'

const record: ConnectionRecord = {
  id: 'r1',
  requesterId: 'm-ada',
  targetId: 'm-bob',
  challengeId: null,
  kind: 'same_boat',
  message: 'Same here.',
  status: 'pending',
  createdAt: '2026-11-08T10:00:00.000Z',
}

const due = (over: Partial<DueNotification>): DueNotification => ({
  id: 'n1',
  type: 'connection_request',
  recipientId: 'm-bob',
  aboutMemberId: 'm-ada',
  connectionId: 'r1',
  createdAt: new Date('2026-11-08T10:00:00.000Z'),
  attempts: 0,
  seen: false,
  hidden: false,
  recipientActive: true,
  aboutDeleted: false,
  requestStatus: 'pending',
  applicantStatus: null,
  applicantEmail: null,
  ...over,
})

function sender(status: DeliveryStatus = 'sent'): {
  send: ReturnType<typeof createNotificationSender>
  sent: OutboundMessage[]
} {
  const sent: OutboundMessage[] = []
  const mailer: Mailer = {
    send: (message) => {
      sent.push(message)
      return Promise.resolve(status)
    },
  }
  const send = createNotificationSender({
    mailer,
    members: {
      emailOf: (id) => Promise.resolve(`${id}@example.invalid`),
      nameOf: (id) => Promise.resolve(id === 'm-ada' ? 'Ada' : 'Bob'),
    },
    publicUrl: 'http://localhost:5173',
    requests: {
      find: (id) => Promise.resolve(id === 'r1' ? record : null),
    },
  })
  return { send, sent }
}

describe('createNotificationSender (R-NOTE-8)', () => {
  it('mails a request to its target as the request email', async () => {
    const { send, sent } = sender()

    expect(await send(due({}))).toBe('sent')
    expect(sent).toEqual([
      expect.objectContaining({
        to: 'm-bob@example.invalid',
        kind: 'connection_request',
        aboutMemberId: 'm-ada',
      }),
    ])
  })

  it('mails an acceptance to the requester, a connection added to the target', async () => {
    const { send, sent } = sender()

    await send(
      due({
        type: 'new_connection',
        recipientId: 'm-ada',
        aboutMemberId: 'm-bob',
      }),
    )
    await send(due({ type: 'new_connection' }))

    expect(sent.map((m) => [m.to, m.kind])).toEqual([
      ['m-ada@example.invalid', 'connection_accepted'],
      ['m-bob@example.invalid', 'connection_added'],
    ])
  })

  it('mails a reviewer the applicant’s address', async () => {
    const { send, sent } = sender()

    await send(
      due({
        type: 'applicant',
        recipientId: 'm-host',
        aboutMemberId: 'm-new',
        connectionId: null,
        requestStatus: null,
        applicantStatus: 'applicant',
        applicantEmail: 'new@example.invalid',
      }),
    )

    expect(sent).toEqual([
      expect.objectContaining({
        to: 'm-host@example.invalid',
        kind: 'admin_notice',
        memberId: 'm-host',
        aboutMemberId: 'm-new',
      }),
    ])
    expect(sent[0]?.text).toContain('new@example.invalid asked for access')
  })

  it('says what became of the mail, and null when nobody got one', async () => {
    expect(await sender('failed').send(due({}))).toBe('failed')
    expect(await sender().send(due({ connectionId: 'gone' }))).toBeNull()
  })
})
