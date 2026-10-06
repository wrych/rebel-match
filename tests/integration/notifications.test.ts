import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { composeApp } from '../../src/compose.js'
import { loadConfig } from '../../src/config.js'
import { DEV_ADMIN_EMAIL } from '../../src/seed/dev/people.js'
import { planSeed } from '../../src/seed/plan.js'
import { applySeed } from '../../src/seed/run.js'
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
const people = {
  ada: 'hanna.vogt@example.invalid',
  bob: 'lars.petersen@example.invalid',
  admin: DEV_ADMIN_EMAIL,
}
const stranger = `${randomUUID()}@example.invalid`

let db: TestDatabase
let app: ReturnType<typeof createApp>
const ids: Record<string, string> = {}
const cookies: Record<string, string> = {}

async function forget(): Promise<void> {
  await db.query(
    'DELETE FROM connection_requests WHERE requester_id IN (?) OR target_id IN (?)',
    [Object.values(ids), Object.values(ids)],
  )
  await db.query('DELETE FROM notifications WHERE recipient_id IN (?)', [
    Object.values(ids),
  ])
  await db.query('DELETE FROM members WHERE email = ?', [stranger])
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
})

afterAll(async () => {
  await forget()
  await db.close()
})

function as(who: string): (r: request.Test) => request.Test {
  return (r) => r.set('Cookie', cookies[who]!)
}

async function listed(who: string): Promise<NotificationView[]> {
  const response = await as(who)(request(app).get('/api/notifications')).expect(
    200,
  )
  return (response.body as { notifications: NotificationView[] }).notifications
}

async function fresh(who: string): Promise<number> {
  const response = await as(who)(
    request(app).get('/api/notifications/new'),
  ).expect(200)
  return (response.body as { count: number }).count
}

async function connect(
  from: string,
  to: string,
  challengeId?: string,
): Promise<string> {
  const response = await as(from)(request(app).post('/api/connections')).send({
    targetId: ids[to],
    challengeId,
    kind: 'same_boat',
    message: 'We are living the same thing; would love to compare notes.',
  })
  return (response.body as { id: string }).id
}

async function nameOf(who: string): Promise<string> {
  const rows = await db.query('SELECT name FROM members WHERE id = ?', [
    ids[who],
  ])
  return String(rows[0]?.['name'])
}

describe('notifications over Postgres (R-NOTE-1..6)', () => {
  it('tells the target of a request, until they open it', async () => {
    const id = await connect('ada', 'bob')

    expect(await listed('bob')).toEqual([
      expect.objectContaining({
        kind: 'connection_request',
        name: await nameOf('ada'),
        path: `/matches/requests/${id}`,
        isNew: true,
      }),
    ])
    expect(await fresh('bob')).toBe(1)
    expect(await fresh('ada')).toBe(0)

    await as('bob')(request(app).get(`/api/connections/${id}`)).expect(200)
    expect(await fresh('bob')).toBe(0)
    expect((await listed('bob'))[0]?.isNew).toBe(false)
  })

  it('tells the requester of an acceptance, until the list shows it', async () => {
    const [incoming] = await listed('bob')
    const id = incoming!.path.split('/').pop()!
    await as('bob')(request(app).post(`/api/connections/${id}/accept`)).expect(
      204,
    )

    const [accepted] = await listed('ada')
    expect(accepted).toMatchObject({
      kind: 'connection_accepted',
      name: await nameOf('bob'),
      path: `/matches/requests/${id}/contact`,
      isNew: true,
    })

    await as('ada')(request(app).get(`/api/connections/${id}`)).expect(200)
    expect(await fresh('ada')).toBe(1)

    await as('ada')(request(app).post('/api/notifications/seen'))
      .send({ ids: [accepted!.id] })
      .expect(204)
    expect(await fresh('ada')).toBe(0)
  })

  it('tells the target when a member already connected connects again, until the contact opens (R-CONN-9)', async () => {
    const [challenge] = await db.query(
      'SELECT id FROM challenges WHERE member_id = ? LIMIT 1',
      [ids['bob']],
    )
    const id = await connect('ada', 'bob', String(challenge?.['id']))

    const [added] = await listed('bob')
    expect(added).toMatchObject({ kind: 'connection_added', isNew: true })

    await as('bob')(request(app).get(`/api/connections/${id}/contact`)).expect(
      200,
    )
    expect(await fresh('bob')).toBe(0)
  })

  it('pages without losing an entry made in the same instant (R-NOTE-5)', async () => {
    const [first] = await listed('bob')
    await db.query(
      "INSERT INTO notifications (id, recipient_id, type, about_member_id, connection_id, created_at, mail_status) SELECT 'zz-twin', recipient_id, type, about_member_id, connection_id, created_at, 'mailed' FROM notifications WHERE id = ?",
      [first!.id],
    )
    const all = (await listed('bob')).map((entry) => entry.id)

    const pages: string[] = []
    let before: string | undefined
    for (;;) {
      const response = await as('bob')(
        request(app)
          .get('/api/notifications')
          .query(before ? { before } : {}),
      ).expect(200)
      const page = (response.body as { notifications: NotificationView[] })
        .notifications
      if (page.length === 0) break
      pages.push(page[0]!.id)
      before = page[0]!.id
      if (pages.length > all.length) break
    }
    await db.query("DELETE FROM notifications WHERE id = 'zz-twin'")

    expect(pages).toEqual(all)
  })

  it('marks nothing of anyone else’s', async () => {
    const [entry] = await listed('bob')
    await db.query('UPDATE notifications SET seen_at = NULL WHERE id = ?', [
      entry!.id,
    ])

    await as('ada')(request(app).post('/api/notifications/seen'))
      .send({ ids: [entry!.id] })
      .expect(204)

    expect(await fresh('bob')).toBe(1)
  })

  it('hides what is about a deleted member (R-NOTE-5, R-NFR-7)', async () => {
    await db.query("UPDATE members SET status = 'deleted' WHERE id = ?", [
      ids['ada'],
    ])
    try {
      expect(await listed('bob')).toEqual([])
      expect(await fresh('bob')).toBe(0)
    } finally {
      await db.query("UPDATE members SET status = 'active' WHERE id = ?", [
        ids['ada'],
      ])
    }
  })

  it('tells reviewers, and only them, of an applicant, until they open the list', async () => {
    await request(app)
      .post('/auth/request-link')
      .send({ email: stranger })
      .expect(200)

    expect(await listed('admin')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'applicant',
          name: stranger,
          path: '/admin/applicants',
          isNew: true,
        }),
      ]),
    )
    expect(
      (await listed('ada')).filter((entry) => entry.kind === 'applicant'),
    ).toEqual([])

    await as('admin')(request(app).get('/api/admin/applicants')).expect(200)
    expect(await fresh('admin')).toBe(0)
  })

  it('goes with the request it is about (R-NOTE-11)', async () => {
    await db.query(
      'DELETE FROM connection_requests WHERE requester_id = ? OR target_id = ?',
      [ids['ada'], ids['ada']],
    )

    expect(await listed('bob')).toEqual([])
  })
})
