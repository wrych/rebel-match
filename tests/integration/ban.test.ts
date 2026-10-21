import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { composeApp } from '../../src/compose.js'
import { loadConfig } from '../../src/config.js'
import { DEV_ADMIN_EMAIL } from '../../src/seed/dev/people.js'
import { planSeed } from '../../src/seed/plan.js'
import { applySeed } from '../../src/seed/run.js'
import type { ConnectionView } from '../../src/services/connections.js'
import type { ModerationPage } from '../../src/services/moderation.js'
import { createWhitelistStore } from '../../src/services/whitelist-store.js'
import {
  openTestDatabase,
  testDatabaseUrl,
  type TestDatabase,
} from './support/database.js'

const config = loadConfig({
  DATABASE_URL: testDatabaseUrl,
  SESSION_SECRET: 'integration-session-secret-of-32-chars',
  NODE_ENV: 'development',
  MAIL_DELIVERY: 'none',
  SEED_PROFILE: 'dev',
})
const bannedEmail = 'sanne.kuipers@example.invalid'
const pending = randomUUID()
const accepted = randomUUID()

let db: TestDatabase
let app: ReturnType<typeof createApp>
let host: string
let banned: string
let other: string
let hostId: string
let bannedId: string

async function idOf(email: string): Promise<string> {
  const rows = await db.query('SELECT id FROM members WHERE email = ?', [email])
  return String(rows[0]?.['id'])
}

async function valueOf(sql: string, id: string): Promise<unknown> {
  const rows = await db.query(sql, [id])
  return Object.values(rows[0] ?? {})[0]
}

function act(path: string, body: object = {}): request.Test {
  return request(app)
    .post(`/api/admin/members/${bannedId}/${path}`)
    .set('Cookie', host)
    .send(body)
}

async function otherSees(): Promise<boolean> {
  const response = await request(app)
    .get('/api/connections/connected')
    .set('Cookie', other)
    .expect(200)
  return (response.body as { connections: ConnectionView[] }).connections.some(
    (each) => each.id === accepted,
  )
}

beforeAll(async () => {
  db = await openTestDatabase()
  await applySeed(db.drizzle, planSeed(config), config.consentVersion)
  const deps = composeApp(config, db.drizzle)
  app = createApp(deps)
  const cookie = async (id: string): Promise<string> => {
    const session = await deps.auth.createSession(id)
    return `${session.name}=${session.value}`
  }
  await db.query("UPDATE members SET status = 'active' WHERE email IN (?)", [
    [DEV_ADMIN_EMAIL, bannedEmail],
  ])
  hostId = await idOf(DEV_ADMIN_EMAIL)
  bannedId = await idOf(bannedEmail)
  const otherId = await idOf('milan.horvat@example.invalid')
  host = await cookie(hostId)
  banned = await cookie(bannedId)
  other = await cookie(otherId)
  await db.query(
    `INSERT INTO connection_requests (id, requester_id, target_id, kind, message, status)
     VALUES (?, ?, ?, 'been_there', 'Use my code REBEL50.', 'pending'),
            (?, ?, ?, 'same_boat', 'Buy my course.', 'accepted')`,
    [pending, bannedId, otherId, accepted, bannedId, otherId],
  )
  await request(app)
    .post('/api/reports')
    .set('Cookie', other)
    .send({ requestId: accepted, reason: 'spam' })
    .expect(204)
})

afterAll(async () => {
  await db.query("UPDATE members SET status = 'active' WHERE id = ?", [
    bannedId,
  ])
  await db.query('DELETE FROM moderation_actions WHERE member_id = ?', [
    bannedId,
  ])
  await db.query('DELETE FROM reports WHERE request_id = ?', [accepted])
  await db.query('DELETE FROM connection_requests WHERE id IN (?, ?)', [
    pending,
    accepted,
  ])
  await db.close()
})

describe('banning a member over Postgres (R-MOD-9, R-MOD-10)', () => {
  it('lets nobody without member:ban do it, and no host ban themselves', async () => {
    await request(app)
      .post(`/api/admin/members/${bannedId}/ban`)
      .set('Cookie', other)
      .send({ note: 'Spam.' })
      .expect(404)
    await request(app)
      .post(`/api/admin/members/${hostId}/ban`)
      .set('Cookie', host)
      .send({ note: 'Oops.' })
      .expect(409)

    expect(
      await valueOf('SELECT status FROM members WHERE id = ?', bannedId),
    ).toBe('active')
  })

  it('bans: sessions end, requests close, reports are handled, the ban recorded', async () => {
    expect(await otherSees()).toBe(true)

    await act('ban', { note: 'Selling to everyone.' }).expect(204)
    await act('ban', { note: 'Again.' }).expect(404)

    expect(
      await valueOf('SELECT status FROM members WHERE id = ?', bannedId),
    ).toBe('banned')
    await request(app).get('/auth/me').set('Cookie', banned).expect(401)
    expect(
      await valueOf(
        'SELECT status FROM connection_requests WHERE id = ?',
        pending,
      ),
    ).toBe('declined')
    expect(await otherSees()).toBe(false)
    const page = await request(app)
      .get(`/api/admin/reports/${bannedId}`)
      .set('Cookie', host)
      .expect(200)
    const body = page.body as ModerationPage
    expect(body.member.status).toBe('banned')
    expect(body.open).toEqual({ reports: 0, reporters: 0 })
    expect(body.history[0]).toMatchObject({
      kind: 'ban',
      note: 'Selling to everyone.',
    })
  })

  it('tells the banned address at the door it is suspended, sending nothing', async () => {
    const mailed = (): Promise<unknown> =>
      valueOf(
        'SELECT count(*)::int AS n FROM outbox WHERE to_email = ?',
        bannedEmail,
      )
    const before = await mailed()

    const response = await request(app)
      .post('/auth/request-link')
      .send({ email: bannedEmail })
      .expect(200)

    expect(response.body).toEqual({ state: 'suspended' })
    expect(await mailed()).toBe(before)
  })

  it('keeps the banned address out of the whitelist (R-AUTH-3)', async () => {
    const [result] = await createWhitelistStore(db.drizzle).add(
      [bannedEmail],
      'member',
      hostId,
    )

    expect(result?.outcome).toBe('kept_out')
    expect(
      await valueOf('SELECT status FROM members WHERE id = ?', bannedId),
    ).toBe('banned')
  })

  it('lifts the ban, bringing back what it hid but no closed request', async () => {
    await act('unban').expect(204)
    await act('unban').expect(404)

    expect(
      await valueOf('SELECT status FROM members WHERE id = ?', bannedId),
    ).toBe('active')
    expect(await otherSees()).toBe(true)
    expect(
      await valueOf(
        'SELECT status FROM connection_requests WHERE id = ?',
        pending,
      ),
    ).toBe('declined')
    expect(
      await valueOf(
        "SELECT count(*)::int AS n FROM moderation_actions WHERE member_id = ? AND kind = 'unban'",
        bannedId,
      ),
    ).toBe(1)
  })
})
