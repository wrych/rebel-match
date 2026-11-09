import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { composeApp } from '../../src/compose.js'
import type { TestDatabase } from './support/database.js'
import {
  cookieFor,
  idOf,
  openSeededDatabase,
  testConfig,
} from './support/app.js'

const config = testConfig({
  SEED_PROFILE: 'dev',
  MAIL_DELIVERY: 'none',
  BADGES: '0',
})
const hour = 3_600_000
const badgeId = randomUUID()
const invite = { id: randomUUID(), token: `bs-open-${randomUUID()}` }
const joiner = `${randomUUID()}@example.invalid`

let db: TestDatabase
let app: ReturnType<typeof createApp>
let milan: string
let cookie: string

beforeAll(async () => {
  db = await openSeededDatabase(config)
  const deps = composeApp(config, db.drizzle)
  app = createApp(deps)
  const [admin] = await db.query(
    "SELECT member_id FROM member_roles WHERE role_key = 'admin' LIMIT 1",
  )
  milan = await idOf(db, 'milan.horvat@example.invalid')
  cookie = await cookieFor(deps.auth, milan)
  await db.query(
    'INSERT INTO event_badges (id, name, ticket_line, big_line) VALUES (?, ?, ?, ?)',
    [badgeId, 'Stormed the Summit', 'SUMMIT', '2026'],
  )
  await db.query(
    'INSERT INTO invites (id, token, label, valid_from, valid_until, max_uses, ' +
      'created_by, event_badge_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [
      invite.id,
      invite.token,
      'Summit',
      new Date(Date.now() - hour),
      new Date(Date.now() + hour),
      10,
      String(admin?.['member_id']),
      badgeId,
    ],
  )
})

afterAll(async () => {
  await db.query('DELETE FROM members WHERE email = ?', [joiner])
  await db.query('DELETE FROM invites WHERE id = ?', [invite.id])
  await db.query('DELETE FROM event_badges WHERE id = ?', [badgeId])
  await db.close()
})

async function earnedOf(memberId: string): Promise<unknown[]> {
  const rows = await db.query(
    'SELECT event_badge_id, seen_at IS NOT NULL AS seen FROM member_event_badges WHERE member_id = ?',
    [memberId],
  )
  return rows.map((row) => [row['event_badge_id'], row['seen']])
}

async function badgeNotesOf(memberId: string): Promise<number> {
  const rows = await db.query(
    "SELECT id FROM notifications WHERE type = 'badge' AND recipient_id = ?",
    [memberId],
  )
  return rows.length
}

describe('badges while hosts have them off (R-BADGE-15)', () => {
  it('answers the badges, their count and marking them as not found (R-NAV-8)', async () => {
    await request(app).get('/api/badges').set('Cookie', cookie).expect(404)
    await request(app).get('/api/badges/new').set('Cookie', cookie).expect(404)
    await request(app)
      .post('/api/badges/seen')
      .set('Cookie', cookie)
      .send({ rows: ['event'] })
      .expect(404)
  })

  it('still records a claimed event badge, seen and not notified', async () => {
    await request(app)
      .post('/api/badges/claim')
      .set('Cookie', cookie)
      .send({ invite: invite.token })
      .expect(204)

    expect(await earnedOf(milan)).toEqual([[badgeId, true]])
    expect(await badgeNotesOf(milan)).toBe(0)
  })

  it('still gives the badge with the membership, seen and not notified', async () => {
    await request(app)
      .post('/auth/request-link')
      .send({ email: joiner, invite: invite.token })
      .expect(200)

    const id = await idOf(db, joiner)
    expect(await earnedOf(id)).toEqual([[badgeId, true]])
    expect(await badgeNotesOf(id)).toBe(0)
  })
})
