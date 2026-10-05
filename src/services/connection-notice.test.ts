import { describe, expect, it } from 'vitest'
import {
  createAcceptNotice,
  createConnectionNotice,
  type NewRequest,
} from './connection-notice.js'
import type { OutboundMessage } from './mailer.js'

const emails: Record<string, string> = {
  'm-ada': 'ada@example.invalid',
  'm-bob': 'bob@example.invalid',
}
const names: Record<string, string> = { 'm-ada': 'Ada  Lovelace\n' }

function deps(
  sent: OutboundMessage[],
): Parameters<typeof createAcceptNotice>[0] {
  return {
    mailer: {
      send: (message) => {
        sent.push(message)
        return Promise.resolve('suppressed')
      },
    },
    members: {
      emailOf: (id) => Promise.resolve(emails[id] ?? null),
      nameOf: (id) => Promise.resolve(names[id] ?? null),
    },
    publicUrl: 'https://match.example.invalid',
  }
}

function setup(): {
  notify: ReturnType<typeof createConnectionNotice>
  sent: OutboundMessage[]
} {
  const sent: OutboundMessage[] = []
  const notify = createConnectionNotice(deps(sent))
  return { notify, sent }
}

const request: NewRequest = {
  id: 'r-1',
  requesterId: 'm-ada',
  targetId: 'm-bob',
  message: 'Same reorg here; shall we compare notes?',
}

describe('createConnectionNotice', () => {
  it('emails the target who asked, their note and a link to the request (R-CONN-2, R-NAV-9)', async () => {
    const { notify, sent } = setup()

    await notify(request)

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      memberId: 'm-bob',
      aboutMemberId: 'm-ada',
      to: 'bob@example.invalid',
      kind: 'connection_request',
      subject: 'Ada Lovelace wants to connect with you on Rebel Match',
    })
    expect(sent[0]?.text).toContain('Ada Lovelace would like to connect')
    expect(sent[0]?.text).toContain('Same reorg here; shall we compare notes?')
    expect(sent[0]?.text).toContain(
      'https://match.example.invalid/matches/requests/r-1',
    )
    expect(sent[0]?.credential).toBeUndefined()
  })

  it('carries no address, not even the requester’s (R-NAV-9)', async () => {
    const { notify, sent } = setup()

    await notify(request)

    expect(`${sent[0]?.subject ?? ''}${sent[0]?.text ?? ''}`).not.toContain('@')
  })

  it('leaves the note out when there is none', async () => {
    const { notify, sent } = setup()

    await notify({ ...request, message: null })

    expect(sent[0]?.text).not.toContain('They wrote')
  })

  it('still sends when the requester has no name yet', async () => {
    const { notify, sent } = setup()

    await notify({ ...request, requesterId: 'm-nameless' })

    expect(sent[0]?.subject).toBe(
      'A Rebel Match member wants to connect with you on Rebel Match',
    )
  })

  it('sends nothing when the target has no active address', async () => {
    const { notify, sent } = setup()

    await notify({ ...request, targetId: 'm-gone' })

    expect(sent).toEqual([])
  })
})

describe('createAcceptNotice', () => {
  const accepted = { id: 'r-1', requesterId: 'm-bob', targetId: 'm-ada' }

  it('emails the requester who accepted and a link to the contact (R-CONN-7, R-NAV-9)', async () => {
    const sent: OutboundMessage[] = []

    await createAcceptNotice(deps(sent))(accepted)

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      memberId: 'm-bob',
      aboutMemberId: 'm-ada',
      to: 'bob@example.invalid',
      kind: 'connection_accepted',
      subject: 'Ada Lovelace accepted your request on Rebel Match',
    })
    expect(sent[0]?.text).toContain(
      'https://match.example.invalid/matches/requests/r-1/contact',
    )
  })

  it('carries no address, the link leads to it (R-NAV-9)', async () => {
    const sent: OutboundMessage[] = []

    await createAcceptNotice(deps(sent))(accepted)

    expect(`${sent[0]?.subject ?? ''}${sent[0]?.text ?? ''}`).not.toContain('@')
  })

  it('still sends when the target has no name', async () => {
    const sent: OutboundMessage[] = []

    await createAcceptNotice(deps(sent))({ ...accepted, targetId: 'm-x' })

    expect(sent[0]?.subject).toBe(
      'A Rebel Match member accepted your request on Rebel Match',
    )
  })

  it('sends nothing when the requester has no active address', async () => {
    const sent: OutboundMessage[] = []

    await createAcceptNotice(deps(sent))({ ...accepted, requesterId: 'm-gone' })

    expect(sent).toEqual([])
  })
})
