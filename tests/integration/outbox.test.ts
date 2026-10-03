import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadConfig } from '../../src/config.js'
import {
  openTestDatabase,
  testDatabaseUrl,
  type Row,
  type TestDatabase,
} from './support/database.js'
import {
  createMailer,
  REDACTED,
  type MailTransport,
  type OutboundMessage,
} from '../../src/services/mailer.js'
import { createOutboxStore } from '../../src/services/outbox-store.js'

const config = loadConfig({
  DATABASE_URL: testDatabaseUrl,
  SESSION_SECRET: 'integration-session-secret-of-32-chars',
})
const to = `${randomUUID()}@example.invalid`
const link = `https://match.example.org/auth/verify?token=${randomUUID()}`
const message: OutboundMessage = {
  memberId: null,
  to,
  kind: 'magic_link',
  subject: 'Your sign-in link',
  text: `Sign in: ${link}`,
  credential: link,
}

let db: TestDatabase

async function latest(): Promise<Row> {
  const rows = await db.query(
    'SELECT * FROM outbox WHERE to_email = ? ORDER BY created_at DESC, id LIMIT 1',
    [to],
  )
  return rows[0]!
}

beforeAll(async () => {
  db = await openTestDatabase()
  await db.query('DELETE FROM outbox WHERE to_email = ?', [to])
})

afterAll(async () => {
  await db.query('DELETE FROM outbox WHERE to_email = ?', [to])
  await db.close()
})

describe('the outbound message log over Postgres', () => {
  it('records a suppressed message with its link in development (R-DEV-1)', async () => {
    const mailer = createMailer({
      store: createOutboxStore(db.drizzle),
      transport: null,
      from: config.mail.from,
      keepCredentials: true,
    })

    expect(await mailer.send(message)).toBe('suppressed')
    expect(await latest()).toMatchObject({
      status: 'suppressed',
      kind: 'magic_link',
      body_text: `Sign in: ${link}`,
    })
  })

  it('records a refused message as failed with a redacted reason (R-MSG-3,4,7)', async () => {
    await db.query('DELETE FROM outbox WHERE to_email = ?', [to])
    const refusing: MailTransport = {
      send: () => Promise.reject(new Error(`550 no such user, ${link}`)),
    }
    const mailer = createMailer({
      store: createOutboxStore(db.drizzle),
      transport: refusing,
      from: config.mail.from,
      keepCredentials: false,
    })

    expect(await mailer.send(message)).toBe('failed')
    expect(await latest()).toMatchObject({
      status: 'failed',
      body_text: `Sign in: ${REDACTED}`,
      error: `550 no such user, ${REDACTED}`,
      sent_at: null,
    })
  })

  it('records a delivered message as sent, with the time', async () => {
    await db.query('DELETE FROM outbox WHERE to_email = ?', [to])
    const mailer = createMailer({
      store: createOutboxStore(db.drizzle),
      transport: { send: () => Promise.resolve() },
      from: config.mail.from,
      keepCredentials: false,
    })

    expect(await mailer.send(message)).toBe('sent')
    const row = await latest()
    expect(row['status']).toBe('sent')
    expect(Date.parse(String(row['sent_at']))).not.toBeNaN()
  })
})
