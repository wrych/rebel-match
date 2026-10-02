import { describe, expect, it } from 'vitest'
import {
  createMailer,
  REDACTED,
  redact,
  storableError,
  type MailTransport,
  type OutboundMessage,
  type OutboxEntry,
  type OutboxStore,
} from './mailer.js'

interface Logged extends OutboxEntry {
  status: 'recorded' | 'sent' | 'suppressed' | 'failed'
  error?: string
  sentAt?: Date
}

function memoryOutbox(): OutboxStore & { rows: Logged[] } {
  const rows: Logged[] = []
  const update = (id: string, change: Partial<Logged>): Promise<void> => {
    Object.assign(rows.find((row) => row.id === id) ?? {}, change)
    return Promise.resolve()
  }
  return {
    rows,
    record: (entry) => {
      rows.push({ ...entry, status: 'recorded' })
      return Promise.resolve()
    },
    markSent: (id, sentAt) => update(id, { status: 'sent', sentAt }),
    markSuppressed: (id) => update(id, { status: 'suppressed' }),
    markFailed: (id, error) => update(id, { status: 'failed', error }),
  }
}

const link = 'https://match.example.org/auth/verify?token=secret-token'
const message: OutboundMessage = {
  memberId: 'm1',
  to: 'ada@example.invalid',
  kind: 'magic_link',
  subject: 'Your sign-in link',
  text: `Sign in: ${link}`,
  credential: link,
}
const now = new Date('2026-11-08T10:00:00Z')

describe('createMailer', () => {
  it('records before it hands the message to the transport (R-MSG-2)', async () => {
    const store = memoryOutbox()
    const seen: string[] = []
    const transport: MailTransport = {
      send: () => {
        seen.push(store.rows[0]?.status ?? 'nothing recorded')
        return Promise.resolve()
      },
    }
    const mailer = createMailer({
      store,
      transport,
      from: 'f',
      keepCredentials: false,
    })

    await mailer.send(message)

    expect(seen).toEqual(['recorded'])
  })

  it('marks a delivered message sent, with the time (R-MSG-3)', async () => {
    const store = memoryOutbox()
    const transport: MailTransport = { send: () => Promise.resolve() }
    const mailer = createMailer({
      store,
      transport,
      from: 'f',
      keepCredentials: false,
      now: () => now,
    })

    expect(await mailer.send(message)).toBe('sent')
    expect(store.rows[0]).toMatchObject({ status: 'sent', sentAt: now })
  })

  it('records and suppresses when delivery is off (R-DEV-1)', async () => {
    const store = memoryOutbox()
    const mailer = createMailer({
      store,
      transport: null,
      from: 'f',
      keepCredentials: true,
    })

    expect(await mailer.send(message)).toBe('suppressed')
    expect(store.rows[0]).toMatchObject({
      status: 'suppressed',
      to: 'ada@example.invalid',
      kind: 'magic_link',
      memberId: 'm1',
    })
  })

  it('keeps the link usable only in a development deployment (R-DEV-1)', async () => {
    const store = memoryOutbox()
    await createMailer({
      store,
      transport: null,
      from: 'f',
      keepCredentials: true,
    }).send(message)

    expect(store.rows[0]?.bodyText).toContain(link)
  })

  it('stores no usable link anywhere else (R-MSG-4)', async () => {
    const store = memoryOutbox()
    const transport: MailTransport = { send: () => Promise.resolve() }
    await createMailer({
      store,
      transport,
      from: 'f',
      keepCredentials: false,
    }).send(message)

    expect(store.rows[0]?.bodyText).toBe(`Sign in: ${REDACTED}`)
    expect(JSON.stringify(store.rows)).not.toContain('secret-token')
  })

  it('records a refused message as failed, with a credential-free reason (R-MSG-7)', async () => {
    const store = memoryOutbox()
    const transport: MailTransport = {
      send: () => Promise.reject(new Error(`550 rejected ${link}`)),
    }
    const mailer = createMailer({
      store,
      transport,
      from: 'f',
      keepCredentials: false,
    })

    expect(await mailer.send(message)).toBe('failed')
    expect(store.rows[0]).toMatchObject({
      status: 'failed',
      error: `550 rejected ${REDACTED}`,
    })
  })

  it('sends the real link, whatever the log keeps', async () => {
    const sent: string[] = []
    const transport: MailTransport = {
      send: (mail) => {
        sent.push(mail.text)
        return Promise.resolve()
      },
    }
    await createMailer({
      store: memoryOutbox(),
      transport,
      from: 'f',
      keepCredentials: false,
    }).send(message)

    expect(sent).toEqual([`Sign in: ${link}`])
  })
})

describe('redact', () => {
  it('removes every occurrence, and leaves text without one alone', () => {
    expect(redact('a X b X', 'X')).toBe(`a ${REDACTED} b ${REDACTED}`)
    expect(redact('nothing here', 'X')).toBe('nothing here')
    expect(redact('a X', undefined)).toBe('a X')
    expect(redact('a X', '')).toBe('a X')
  })
})

describe('storableError', () => {
  it('fits the column, and accepts a thrown non-error', () => {
    expect(storableError(new Error('x'.repeat(900)))).toHaveLength(500)
    expect(storableError('timeout')).toBe('timeout')
  })
})
