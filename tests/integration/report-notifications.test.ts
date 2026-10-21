import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { composeApp } from '../../src/compose.js'
import { loadConfig } from '../../src/config.js'
import { DEV_ADMIN_EMAIL } from '../../src/seed/dev/people.js'
import { planSeed } from '../../src/seed/plan.js'
import { applySeed } from '../../src/seed/run.js'
import { createNotificationMailStore } from '../../src/services/notification-mail-store.js'
import { skipReason } from '../../src/services/notification-worker.js'
import type { NotificationView } from '../../src/services/notifications.js'
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
// The reporter is a host, so the test shows a reviewer is not told of their
// own report; the second host is told.
const people = {
  author: 'sanne.kuipers@example.invalid',
  reporter: DEV_ADMIN_EMAIL,
  host: 'milan.horvat@example.invalid',
}
const accepted = randomUUID()

let db: TestDatabase
let app: ReturnType<typeof createApp>
const ids: Record<string, string> = {}
const cookies: Record<string, string> = {}

function as(who: string, path: string): request.Test {
  return request(app).get(path).set('Cookie', cookies[who]!)
}

async function reportsListed(who: string): Promise<NotificationView[]> {
  const response = await as(who, '/api/notifications').expect(200)
  return (
    response.body as { notifications: NotificationView[] }
  ).notifications.filter((entry) => entry.kind === 'report')
}

async function forget(): Promise<void> {
  await db.query('DELETE FROM moderation_actions WHERE member_id = ?', [
    ids['author'],
  ])
  await db.query('DELETE FROM reports WHERE request_id = ?', [accepted])
  await db.query('DELETE FROM connection_requests WHERE id = ?', [accepted])
  await db.query("DELETE FROM notifications WHERE type = 'report'")
  await db.query(
    "DELETE FROM member_roles WHERE member_id = ? AND role_key = 'admin'",
    [ids['host']],
  )
}

beforeAll(async () => {
  db = await openTestDatabase()
  await applySeed(db.drizzle, planSeed(config), config.consentVersion)
  const deps = composeApp(config, db.drizzle)
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
    "INSERT INTO member_roles (member_id, role_key) VALUES (?, 'admin')",
    [ids['host']],
  )
  // What earlier seeds or files left waiting is no concern of these tests.
  await db.query(
    "UPDATE notifications SET mail_status = 'skipped' WHERE mail_status = 'waiting'",
  )
  await db.query(
    `INSERT INTO connection_requests (id, requester_id, target_id, kind, message, status)
     VALUES (?, ?, ?, 'same_boat', 'Buy my course, code REBEL50.', 'accepted')`,
    [accepted, ids['author'], ids['reporter']],
  )
  await request(app)
    .post('/api/reports')
    .set('Cookie', cookies['reporter']!)
    .send({ requestId: accepted, reason: 'spam', comment: 'Selling.' })
    .expect(204)
})

afterAll(async () => {
  await forget()
  await db.close()
})

describe('the New report notification over Postgres (R-MOD-5)', () => {
  it('tells the other hosts who was reported, never the reporter or the reported', async () => {
    const [entry] = await reportsListed('host')

    expect(entry).toMatchObject({
      kind: 'report',
      path: `/admin/moderation/${ids['author']!}`,
      openReports: 1,
      isNew: true,
    })
    expect(JSON.stringify(entry)).not.toContain('Selling.')
    expect(await reportsListed('reporter')).toEqual([])
    expect(await reportsListed('author')).toEqual([])
  })

  it('counts the members with open reports for the menu, for hosts only', async () => {
    const count = await as('host', '/api/admin/reports/count').expect(200)

    expect((count.body as { members: number }).members).toBeGreaterThan(0)
    await as('author', '/api/admin/reports/count').expect(404)
  })

  it('is seen once the host opens the member’s moderation page', async () => {
    await as('host', `/api/admin/reports/${ids['author']!}`).expect(200)

    expect((await reportsListed('host'))[0]?.isNew).toBe(false)
  })

  it('is mailed no longer once the reports are handled (R-NOTE-9)', async () => {
    await request(app)
      .post('/api/admin/reports/dismiss')
      .set('Cookie', cookies['host']!)
      .send({ requestId: accepted })
      .expect(204)
    await db.query(
      "UPDATE notifications SET seen_at = NULL WHERE type = 'report'",
    )

    const now = new Date()
    const due = await createNotificationMailStore(db.drizzle).claimDue(
      now,
      100,
      new Date(now.getTime() + 60_000),
    )
    const mine = due.filter(
      (note) => note.type === 'report' && note.recipientId === ids['host'],
    )

    expect(mine).toHaveLength(1)
    expect(mine[0]?.openReports).toBe(0)
    expect(skipReason(mine[0]!)).toBe('stale')
    expect((await reportsListed('host'))[0]?.openReports).toBe(0)
  })
})
