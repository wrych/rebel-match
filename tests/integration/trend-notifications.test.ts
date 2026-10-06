import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp, type AppDeps } from '../../src/app.js'
import { composeApp } from '../../src/compose.js'
import { loadConfig } from '../../src/config.js'
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
  follower: 'aline.dubois@example.invalid',
  author: 'tobias.renner@example.invalid',
}
const TREND = '07'

let db: TestDatabase
let app: ReturnType<typeof createApp>
let deps: AppDeps
const ids: Record<string, string> = {}
const cookies: Record<string, string> = {}
let challengeId = ''

async function forget(): Promise<void> {
  const all = Object.values(ids)
  await db.query('DELETE FROM follows WHERE member_id IN (?)', [all])
  await db.query('DELETE FROM notification_settings WHERE member_id IN (?)', [
    all,
  ])
  await db.query('DELETE FROM swipes WHERE member_id IN (?)', [all])
  await db.query(
    "DELETE FROM outbox WHERE member_id IN (?) AND kind = 'trend_challenge'",
    [all],
  )
  if (challengeId !== '')
    await db.query('DELETE FROM challenges WHERE id = ?', [challengeId])
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

async function listed(who: string): Promise<NotificationView[]> {
  const response = await as(who)(request(app).get('/api/notifications')).expect(
    200,
  )
  return (response.body as { notifications: NotificationView[] }).notifications
}

describe('notifying followers of a new challenge (R-ASK-9, R-NOTE-1, R-OFF-7)', () => {
  it('tells every follower but its author once its trend is first confirmed', async () => {
    await as('follower')(request(app).post(`/api/follows/${TREND}`)).expect(204)
    await as('author')(request(app).post(`/api/follows/${TREND}`)).expect(204)
    const created = await as('author')(request(app).post('/api/challenges'))
      .send({
        body: 'Our teams wait weeks for decisions nobody owns, and the best people leave.',
      })
      .expect(201)
    challengeId = (created.body as { challenge: { id: string } }).challenge.id
    expect(
      (await listed('follower')).filter((n) => n.kind === 'trend_challenge'),
    ).toEqual([])

    await as('author')(request(app).patch(`/api/challenges/${challengeId}`))
      .send({ trendId: TREND })
      .expect(204)
    await as('author')(request(app).patch(`/api/challenges/${challengeId}`))
      .send({ trendId: TREND })
      .expect(204)

    const told = (await listed('follower')).filter(
      (n) => n.kind === 'trend_challenge',
    )
    expect(told).toEqual([
      expect.objectContaining({
        path: `/offer?challenge=${challengeId}`,
        isNew: true,
      }),
    ])
    expect(told[0]?.trend).toEqual(expect.any(String))
    expect(
      (await listed('author')).filter((n) => n.kind === 'trend_challenge'),
    ).toEqual([])
  })

  it('mails it daily by default, and at once when chosen', async () => {
    await deps.notificationMail.deliverDue()
    const held = await db.query(
      "SELECT mail_status FROM notifications WHERE recipient_id = ? AND type = 'trend_challenge'",
      [ids['follower']],
    )
    expect(held).toEqual([{ mail_status: 'waiting' }])

    await as('follower')(
      request(app).put('/api/me/notification-settings/trend_challenge'),
    )
      .send({ cadence: 'immediately' })
      .expect(204)
    await deps.notificationMail.deliverDue()

    const mails = await db.query(
      "SELECT subject, body_text FROM outbox WHERE member_id = ? AND kind = 'trend_challenge'",
      [ids['follower']],
    )
    expect(mails).toHaveLength(1)
    expect(String(mails[0]?.['body_text'])).toContain(
      `/offer?challenge=${challengeId}`,
    )
    expect(String(mails[0]?.['body_text'])).not.toContain(
      'decisions nobody owns',
    )
  })

  it('opens the deck at its card, which marks it seen (R-OFF-7, R-NOTE-5)', async () => {
    await db.query(
      "UPDATE notifications SET seen_at = NULL WHERE recipient_id = ? AND type = 'trend_challenge'",
      [ids['follower']],
    )

    const deck = await as('follower')(
      request(app).get('/api/deck').query({ first: challengeId }),
    ).expect(200)

    expect(
      (deck.body as { cards: { challengeId: string }[] }).cards[0]?.challengeId,
    ).toBe(challengeId)
    const [entry] = (await listed('follower')).filter(
      (n) => n.kind === 'trend_challenge',
    )
    expect(entry?.isNew).toBe(false)
  })

  it('opens the deck as usual at a card it would not show, revealing nothing', async () => {
    const deck = await as('author')(
      request(app).get('/api/deck').query({ first: challengeId }),
    ).expect(200)

    expect(
      (deck.body as { cards: { challengeId: string }[] }).cards.map(
        (card) => card.challengeId,
      ),
    ).not.toContain(challengeId)
  })

  it('stops showing it once the challenge is gone', async () => {
    await db.query("UPDATE challenges SET status = 'archived' WHERE id = ?", [
      challengeId,
    ])

    expect(
      (await listed('follower')).filter((n) => n.kind === 'trend_challenge'),
    ).toEqual([])
  })
})
