import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp, type AppDeps } from '../../src/app.js'
import { composeApp } from '../../src/compose.js'
import { loadConfig } from '../../src/config.js'
import { DEV_ADMIN_EMAIL } from '../../src/seed/dev/people.js'
import { planSeed } from '../../src/seed/plan.js'
import { applySeed } from '../../src/seed/run.js'
import type { NotificationSetting } from '../../src/services/notification-settings.js'
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
const people = {
  ada: 'elena.marchetti@example.invalid',
  bob: 'ola.nyberg@example.invalid',
  eve: 'yusuf.kaya@example.invalid',
  admin: DEV_ADMIN_EMAIL,
}

let db: TestDatabase
let app: ReturnType<typeof createApp>
let deps: AppDeps
const ids: Record<string, string> = {}
const cookies: Record<string, string> = {}

async function forget(): Promise<void> {
  const all = Object.values(ids)
  await db.query(
    'DELETE FROM connection_requests WHERE requester_id IN (?) OR target_id IN (?)',
    [all, all],
  )
  await db.query('DELETE FROM notification_settings WHERE member_id IN (?)', [
    all,
  ])
  await db.query('DELETE FROM outbox WHERE member_id IN (?)', [all])
}

beforeAll(async () => {
  db = await openTestDatabase()
  await applySeed(db.drizzle, planSeed(config), config.consentVersion)
  deps = composeApp(config, db.drizzle)
  app = createApp(deps)
  for (const [who, email] of Object.entries(people)) {
    await db.query("UPDATE members SET status = 'active' WHERE email = ?", [
      email,
    ])
    const rows = await db.query('SELECT id FROM members WHERE email = ?', [
      email,
    ])
    ids[who] = String(rows[0]?.['id'])
    const session = await deps.auth.createSession(ids[who])
    cookies[who] = `${session.name}=${session.value}`
  }
  await forget()
  await db.query(
    "UPDATE notifications SET mail_status = 'skipped' WHERE mail_status = 'waiting'",
  )
})

afterAll(async () => {
  await forget()
  await db.close()
})

function as(who: string): (r: request.Test) => request.Test {
  return (r) => r.set('Cookie', cookies[who]!)
}

async function ask(from: string, to: string): Promise<string> {
  const response = await as(from)(request(app).post('/api/connections'))
    .send({
      targetId: ids[to],
      kind: 'same_boat',
      message: `From ${from}: we are living the same thing.`,
    })
    .expect(201)
  return (response.body as { id: string }).id
}

async function choose(
  who: string,
  type: string,
  cadence: string,
): Promise<void> {
  await as(who)(request(app).put(`/api/me/notification-settings/${type}`))
    .send({ cadence })
    .expect(204)
}

describe('notification cadences over Postgres (R-NOTE-2, R-NOTE-3, R-NOTE-7)', () => {
  it('lists the types a member receives at their defaults, and keeps a choice', async () => {
    const read = async (who: string): Promise<NotificationSetting[]> =>
      (
        (
          await as(who)(
            request(app).get('/api/me/notification-settings'),
          ).expect(200)
        ).body as { settings: NotificationSetting[] }
      ).settings

    expect((await read('bob')).map((s) => [s.type, s.cadence])).toEqual([
      ['connection_request', 'hourly'],
      ['new_connection', 'hourly'],
      ['trend_challenge', 'daily'],
    ])
    expect((await read('admin')).map((s) => s.type)).toContain('applicant')

    await choose('bob', 'new_connection', 'daily')
    expect((await read('bob'))[1]?.cadence).toBe('daily')
    await choose('bob', 'new_connection', 'hourly')
    const rows = await db.query(
      'SELECT count(*)::int AS n FROM notification_settings WHERE member_id = ?',
      [ids['bob']],
    )
    expect(rows[0]?.['n']).toBe(0)
  })

  it('mails one member’s notifications on one cadence in one digest, then holds the next for a window', async () => {
    await ask('ada', 'bob')
    await ask('eve', 'bob')

    await deps.notificationMail.deliverDue()

    const mails = await db.query(
      'SELECT id, kind, subject FROM outbox WHERE member_id = ?',
      [ids['bob']],
    )
    expect(mails).toEqual([
      expect.objectContaining({
        kind: 'notification_digest',
        subject: '2 updates on Rebel Match',
      }),
    ])
    const quoted = await db.query(
      'SELECT member_id FROM outbox_quotes WHERE outbox_id = ? ORDER BY member_id',
      [mails[0]?.['id']],
    )
    expect(quoted.map((row) => row['member_id']).sort()).toEqual(
      [ids['ada'], ids['eve']].sort(),
    )

    await ask('admin', 'bob')
    await deps.notificationMail.deliverDue()

    const held = await db.query(
      "SELECT next_attempt_at FROM notifications WHERE recipient_id = ? AND mail_status = 'waiting'",
      [ids['bob']],
    )
    expect(held).toHaveLength(1)
    const wait =
      new Date(String(held[0]?.['next_attempt_at'])).getTime() - Date.now()
    expect(wait).toBeGreaterThan(55 * 60_000)
  })

  it('applies a new choice to what is still held (R-NOTE-3)', async () => {
    await choose('bob', 'connection_request', 'immediately')

    await deps.notificationMail.deliverDue()

    const waiting = await db.query(
      "SELECT count(*)::int AS n FROM notifications WHERE recipient_id = ? AND mail_status = 'waiting'",
      [ids['bob']],
    )
    expect(waiting[0]?.['n']).toBe(0)
    const mails = await db.query(
      "SELECT kind FROM outbox WHERE member_id = ? AND kind = 'connection_request'",
      [ids['bob']],
    )
    expect(mails).toHaveLength(1)
    await choose('bob', 'connection_request', 'hourly')
  })

  it('erases a digest with any member it quotes (R-MSG-6)', async () => {
    const before = await db.query(
      "SELECT count(*)::int AS n FROM outbox WHERE member_id = ? AND kind = 'notification_digest'",
      [ids['bob']],
    )
    expect(before[0]?.['n']).toBe(1)
    const stranger = randomUUID()
    await db.query(
      "INSERT INTO members (id, email, name, status, analytics_id, consent_version, consent_at) VALUES (?, ?, 'Gone Soon', 'active', ?, 'x', now())",
      [stranger, `${stranger}@example.invalid`, randomUUID()],
    )
    const [digest] = await db.query(
      "SELECT id FROM outbox WHERE member_id = ? AND kind = 'notification_digest'",
      [ids['bob']],
    )
    await db.query(
      'INSERT INTO outbox_quotes (outbox_id, member_id) VALUES (?, ?)',
      [digest?.['id'], stranger],
    )

    await as('admin')(
      request(app).delete(`/api/admin/members/${stranger}?now=true`),
    ).expect(204)

    const after = await db.query(
      "SELECT count(*)::int AS n FROM outbox WHERE member_id = ? AND kind = 'notification_digest'",
      [ids['bob']],
    )
    expect(after[0]?.['n']).toBe(0)
  })

  it('stores but hides a type set to off, and hides what of it was unseen (R-NOTE-3, R-NOTE-4)', async () => {
    const waiting = await as('bob')(
      request(app).get('/api/notifications/new'),
    ).expect(200)
    expect((waiting.body as { count: number }).count).toBeGreaterThan(0)

    await choose('bob', 'connection_request', 'off')
    const hiddenNow = await as('bob')(
      request(app).get('/api/notifications/new'),
    ).expect(200)
    expect((hiddenNow.body as { count: number }).count).toBe(0)

    await db.query('DELETE FROM connection_requests WHERE requester_id = ?', [
      ids['ada'],
    ])
    const id = await ask('ada', 'bob')
    const stored = await db.query(
      'SELECT hidden FROM notifications WHERE connection_id = ?',
      [id],
    )
    expect(stored).toEqual([{ hidden: true }])
    const fresh = await as('bob')(
      request(app).get('/api/notifications/new'),
    ).expect(200)
    expect((fresh.body as { count: number }).count).toBe(0)

    await deps.notificationMail.deliverDue()
    const after = await db.query(
      'SELECT mail_status, skipped_reason FROM notifications WHERE connection_id = ?',
      [id],
    )
    expect(after).toEqual([{ mail_status: 'skipped', skipped_reason: 'off' }])
  })
})
