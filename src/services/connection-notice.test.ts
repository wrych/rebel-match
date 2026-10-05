import { describe, expect, it } from 'vitest'
import { createConnectionNotice } from './connection-notice.js'
import type { Mailer, OutboundMessage } from './mailer.js'

function setup(addresses: Record<string, string>): {
  notify: ReturnType<typeof createConnectionNotice>
  sent: OutboundMessage[]
} {
  const sent: OutboundMessage[] = []
  const mailer: Mailer = {
    send: (message) => {
      sent.push(message)
      return Promise.resolve('suppressed')
    },
  }
  const notify = createConnectionNotice({
    mailer,
    members: { emailOf: (id) => Promise.resolve(addresses[id] ?? null) },
    publicUrl: 'https://match.example.invalid',
  })
  return { notify, sent }
}

describe('createConnectionNotice', () => {
  it('emails the target a link to the request (R-CONN-2, R-NAV-9)', async () => {
    const { notify, sent } = setup({ 'm-bob': 'bob@example.invalid' })

    await notify({ id: 'r-1', targetId: 'm-bob' })

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      memberId: 'm-bob',
      to: 'bob@example.invalid',
      kind: 'connection_request',
    })
    expect(sent[0]?.text).toContain(
      'https://match.example.invalid/matches/requests/r-1',
    )
    expect(sent[0]?.credential).toBeUndefined()
  })

  it('carries no address in its body, not even the recipient’s (R-NAV-9)', async () => {
    const { notify, sent } = setup({ 'm-bob': 'bob@example.invalid' })

    await notify({ id: 'r-1', targetId: 'm-bob' })

    expect(sent[0]?.subject).not.toContain('@')
    expect(sent[0]?.text).not.toContain('@')
  })

  it('sends nothing when the target has no active address', async () => {
    const { notify, sent } = setup({})

    await notify({ id: 'r-1', targetId: 'm-gone' })

    expect(sent).toEqual([])
  })
})
