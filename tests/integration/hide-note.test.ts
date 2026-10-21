import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { composeApp } from '../../src/compose.js'
import { loadConfig } from '../../src/config.js'
import {
  openTestDatabase,
  testDatabaseUrl,
  type TestDatabase,
} from './support/database.js'
import { DEV_ADMIN_EMAIL } from '../../src/seed/dev/people.js'
import { planSeed } from '../../src/seed/plan.js'
import { applySeed } from '../../src/seed/run.js'
import { createConnectionStore } from '../../src/services/connection-store.js'
import type { ConnectionView } from '../../src/services/connections.js'
import type { ModerationPage } from '../../src/services/moderation.js'

const config = loadConfig({
  DATABASE_URL: testDatabaseUrl,
  SESSION_SECRET: 'integration-session-secret-of-32-chars',
  NODE_ENV: 'test',
  SEED_PROFILE: 'dev',
})
const pending = randomUUID()
const accepted = randomUUID()
const words = 'Book my paid coaching, code REBEL50.'

let db: TestDatabase
let app: ReturnType<typeof createApp>
let host: string
let sender: string
let recipient: string
let senderId: string

async function idOf(email: string): Promise<string> {
  const rows = await db.query('SELECT id FROM members WHERE email = ?', [email])
  return String(rows[0]?.['id'])
}

async function statusOf(id: string): Promise<unknown> {
  const rows = await db.query(
    'SELECT status FROM connection_requests WHERE id = ?',
    [id],
  )
  return rows[0]?.['status']
}

async function viewOf(cookie: string): Promise<ConnectionView | undefined> {
  const response = await request(app)
    .get('/api/connections/connected')
    .set('Cookie', cookie)
  return (response.body as { connections: ConnectionView[] }).connections.find(
    (each) => each.id === accepted,
  )
}

function act(path: string, body: object = {}): request.Test {
  return request(app)
    .post(`/api/admin/requests/${path}`)
    .set('Cookie', host)
    .send(body)
}

beforeAll(async () => {
  db = await openTestDatabase()
  await applySeed(db.drizzle, planSeed(config), config.consentVersion)
  await db.query("UPDATE members SET status = 'active' WHERE email = ?", [
    DEV_ADMIN_EMAIL,
  ])
  const deps = composeApp(config, db.drizzle)
  app = createApp(deps)
  const cookie = async (id: string): Promise<string> => {
    const session = await deps.auth.createSession(id)
    return `${session.name}=${session.value}`
  }
  senderId = await idOf('sanne.kuipers@example.invalid')
  const recipientId = await idOf('milan.horvat@example.invalid')
  sender = await cookie(senderId)
  recipient = await cookie(recipientId)
  host = await cookie(await idOf(DEV_ADMIN_EMAIL))
  await db.query(
    `INSERT INTO connection_requests (id, requester_id, target_id, kind, message, status)
     VALUES (?, ?, ?, 'been_there', ?, 'pending'),
            (?, ?, ?, 'same_boat', ?, 'accepted')`,
    [
      pending,
      senderId,
      recipientId,
      words,
      accepted,
      senderId,
      recipientId,
      words,
    ],
  )
  await request(app)
    .post('/api/reports')
    .set('Cookie', recipient)
    .send({ requestId: accepted, reason: 'spam' })
    .expect(204)
})

afterAll(async () => {
  await db.query('DELETE FROM moderation_actions WHERE member_id = ?', [
    senderId,
  ])
  await db.query('DELETE FROM reports WHERE request_id IN (?, ?)', [
    pending,
    accepted,
  ])
  await db.query('DELETE FROM connection_requests WHERE id IN (?, ?)', [
    pending,
    accepted,
  ])
  await db.close()
})

describe('a host hiding a note over Postgres (R-MOD-8)', () => {
  it('lets nobody without challenge:moderate hide it', async () => {
    await request(app)
      .post(`/api/admin/requests/${pending}/hide-note`)
      .set('Cookie', recipient)
      .send({ reason: 'spam' })
      .expect(404)

    expect(await statusOf(pending)).toBe('pending')
  })

  it('hides a pending request’s note once, declining it without a word', async () => {
    await act(`${pending}/hide-note`, { reason: 'spam' }).expect(204)
    await act(`${pending}/hide-note`, { reason: 'spam' }).expect(404)

    expect(await statusOf(pending)).toBe('declined')
  })

  it('keeps an accepted connection, the note gone for the recipient and kept for the sender', async () => {
    await act(`${accepted}/hide-note`, { reason: 'inappropriate' }).expect(204)

    expect(await statusOf(accepted)).toBe('accepted')
    expect(await viewOf(recipient)).toMatchObject({
      message: null,
      noteHiddenAs: 'inappropriate',
    })
    expect(await viewOf(sender)).toMatchObject({
      message: words,
      noteHiddenAs: 'inappropriate',
    })
  })

  it('leaves the note out of the record the mail is written from', async () => {
    const record = await createConnectionStore(db.drizzle).find(accepted)

    expect(record?.message).toBeNull()
  })

  it('handles the note’s reports and records the hiding (R-MOD-7, R-MOD-11)', async () => {
    const response = await request(app)
      .get(`/api/admin/reports/${senderId}`)
      .set('Cookie', host)
      .expect(200)
    const page = response.body as ModerationPage
    const item = page.items.find((each) => each.id === accepted)

    expect(item).toMatchObject({
      state: 'hidden',
      hiddenReason: 'inappropriate',
    })
    expect(item?.reports.every((report) => !report.open)).toBe(true)
    expect(page.history[0]).toMatchObject({
      kind: 'hide',
      item: 'note',
      reason: 'inappropriate',
    })
  })

  it('shows it again on unhide, reopening no request', async () => {
    await act(`${pending}/unhide-note`).expect(204)
    await act(`${accepted}/unhide-note`).expect(204)
    await act(`${accepted}/unhide-note`).expect(404)

    expect(await statusOf(pending)).toBe('declined')
    expect(
      (await createConnectionStore(db.drizzle).find(accepted))?.message,
    ).toBe(words)
    expect(await viewOf(recipient)).toMatchObject({
      noteHiddenAs: null,
      noteReported: true,
      message: null,
    })
  })
})
