import { describe, expect, it } from 'vitest'
import { createConnectionNotice, type NewRequest } from './connection-notice.js'
import type { OutboundMessage } from './mailer.js'

const emails: Record<string, string> = {
  'm-ada': 'ada@example.invalid',
  'm-bob': 'bob@example.invalid',
}
const names: Record<string, string> = { 'm-ada': 'Ada  Lovelace\n' }

function deps(
  sent: OutboundMessage[],
): Parameters<typeof createConnectionNotice>[0] {
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
