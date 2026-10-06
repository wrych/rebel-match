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
const accepted: ConnectionRecord = {
  ...record,
  id: 'r2',
  requesterId: 'm-bob',
  targetId: 'm-eve',
  message: null,
  status: 'accepted',
}

const due = (over: Partial<DueNotification> = {}): DueNotification => ({
  id: 'n1',
  type: 'connection_request',
  recipientId: 'm-bob',
  aboutMemberId: 'm-ada',
  connectionId: 'r1',
  createdAt: new Date('2026-11-08T10:00:00.000Z'),
  attempts: 0,
  cadence: 'immediately',
  seen: false,
  hidden: false,
  recipientActive: true,
  aboutDeleted: false,
  requestStatus: 'pending',
  applicantStatus: null,
  applicantEmail: null,
  challengeId: null,
  challengeActive: false,
  trend: null,
  ...over,
})

const names: Record<string, string> = {
  'm-ada': 'Ada',
  'm-bob': 'Bob',
  'm-eve': 'Eve',
}

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
      nameOf: (id) => Promise.resolve(names[id] ?? null),
    },
    publicUrl: 'http://localhost:5173',
    requests: {
      find: (id) =>
        Promise.resolve(id === 'r1' ? record : id === 'r2' ? accepted : null),
    },
  })
  return { send, sent }
}

const applicant = due({
  id: 'n3',
  type: 'applicant',
  aboutMemberId: 'm-new',
  connectionId: null,
  requestStatus: null,
  applicantStatus: 'applicant',
  applicantEmail: 'new@example.invalid',
})

describe('one notification: its type’s own email (R-NOTE-8)', () => {
  it('mails a request to its target as the request email', async () => {
    const { send, sent } = sender()

    expect(await send([due()])).toBe('sent')
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

    await send([
      due({
        type: 'new_connection',
        recipientId: 'm-ada',
        aboutMemberId: 'm-bob',
      }),
    ])
    await send([due({ type: 'new_connection' })])

    expect(sent.map((m) => [m.to, m.kind])).toEqual([
      ['m-ada@example.invalid', 'connection_accepted'],
      ['m-bob@example.invalid', 'connection_added'],
    ])
  })

  it('mails a reviewer the applicant’s address', async () => {
    const { send, sent } = sender()

    await send([{ ...applicant, recipientId: 'm-host' }])

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
    expect(await sender('failed').send([due()])).toBe('failed')
    expect(await sender().send([due({ connectionId: 'gone' })])).toBeNull()
  })
})

const trendNote = due({
  id: 'n4',
  type: 'trend_challenge',
  connectionId: null,
  requestStatus: null,
  challengeId: 'c1',
  challengeActive: true,
  trend: 'Radical Transparency',
})

describe('a new challenge in a followed trend (R-ASK-9, R-OFF-7)', () => {
  it('mails the follower its author and trend, linking the deck at its card, never its words', async () => {
    const { send, sent } = sender()

    expect(await send([trendNote])).toBe('sent')

    expect(sent).toEqual([
      {
        memberId: 'm-bob',
        aboutMemberId: 'm-ada',
        to: 'm-bob@example.invalid',
        kind: 'trend_challenge',
        subject: 'Ada posted a challenge in Radical Transparency',
        text:
          'Ada posted a challenge in Radical Transparency, a trend you follow on Rebel Match.\n\n' +
          'See it, and say if you are in the same boat or have been there, here:\n' +
          'http://localhost:5173/offer?challenge=c1\n',
      },
    ])
  })

  it('takes a line of its own in a digest', async () => {
    const { send, sent } = sender()

    await send([due(), trendNote])

    expect(sent[0]?.text).toContain(
      'Ada posted a challenge in Radical Transparency.\nhttp://localhost:5173/offer?challenge=c1',
    )
  })
})

describe('several: one digest (R-NOTE-8, R-MSG-6)', () => {
  it('says how many, lists each with its link and the note a request carries, and names everyone it quotes', async () => {
    const { send, sent } = sender()

    expect(
      await send([
        due(),
        due({
          id: 'n2',
          type: 'new_connection',
          connectionId: 'r2',
          aboutMemberId: 'm-eve',
          requestStatus: 'accepted',
        }),
        applicant,
      ]),
    ).toBe('sent')

    expect(sent).toHaveLength(1)
    const [mail] = sent
    expect(mail).toMatchObject({
      memberId: 'm-bob',
      to: 'm-bob@example.invalid',
      kind: 'notification_digest',
      subject: '3 updates on Rebel Match',
      quotes: ['m-ada', 'm-eve', 'm-new'],
    })
    expect(mail?.text).toContain(
      'Ada wants to connect with you.\nThey wrote: Same here.\nhttp://localhost:5173/matches/requests/r1',
    )
    expect(mail?.text).toContain(
      'Eve accepted your request.\nhttp://localhost:5173/matches/requests/r2/contact',
    )
    expect(mail?.text).toContain(
      'new@example.invalid asked to join.\nhttp://localhost:5173/admin/applicants',
    )
    expect(mail?.text).toContain('http://localhost:5173/profile')
    expect(mail?.text).not.toContain('@example.invalid accepted')
  })

  it('leaves out what is gone, and sends nothing when all is', async () => {
    const { send, sent } = sender()

    await send([due(), due({ id: 'n2', connectionId: 'gone' })])
    expect(sent[0]?.subject).toBe('1 update on Rebel Match')

    expect(
      await send([
        due({ connectionId: 'gone' }),
        due({ id: 'n2', connectionId: 'gone' }),
      ]),
    ).toBeNull()
  })
})
