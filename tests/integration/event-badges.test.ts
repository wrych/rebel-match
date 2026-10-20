import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { composeApp } from '../../src/compose.js'
import { loadConfig } from '../../src/config.js'
import type { BadgeOverview } from '../../src/services/badges.js'
import {
  openTestDatabase,
  testDatabaseUrl,
  type TestDatabase,
} from './support/database.js'
import { planSeed } from '../../src/seed/plan.js'
import { applySeed } from '../../src/seed/run.js'

const config = loadConfig({
  DATABASE_URL: testDatabaseUrl,
  SESSION_SECRET: 'integration-session-secret-of-32-chars',
  NODE_ENV: 'test',
  SEED_PROFILE: 'dev',
  MAIL_DELIVERY: 'none',
})
const hour = 3_600_000
const badgeId = randomUUID()
const scanner = `${randomUUID()}@example.invalid`
// Each invite gives the badge; only the first two are in their window and
// not revoked, the second full.
const invites = {
  open: { id: randomUUID(), token: `eb-open-${randomUUID()}` },
  full: { id: randomUUID(), token: `eb-full-${randomUUID()}` },
  revoked: { id: randomUUID(), token: `eb-rv-${randomUUID()}` },
  expired: { id: randomUUID(), token: `eb-ex-${randomUUID()}` },
  scheduled: { id: randomUUID(), token: `eb-sc-${randomUUID()}` },
}

let db: TestDatabase
let app: ReturnType<typeof createApp>
let milan: string
let cookie: string

async function insertInvites(adminId: string): Promise<void> {
  const now = Date.now()
  const rows = [
    [invites.open, now - hour, now + hour, 10, 0, null],
    [invites.full, now - hour, now + hour, 1, 1, null],
    [invites.revoked, now - hour, now + hour, 10, 0, now],
    [invites.expired, now - 2 * hour, now - hour, 10, 0, null],
    [invites.scheduled, now + hour, now + 2 * hour, 10, 0, null],
  ] as const
  for (const [invite, from, until, maxUses, uses, revokedAt] of rows)
    await db.query(
      'INSERT INTO invites (id, token, label, valid_from, valid_until, max_uses, ' +
        'uses, revoked_at, created_by, event_badge_id) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        invite.id,
        invite.token,
        'Summit',
        new Date(from),
        new Date(until),
        maxUses,
        uses,
        revokedAt === null ? null : new Date(revokedAt),
        adminId,
        badgeId,
      ],
    )
}

beforeAll(async () => {
  db = await openTestDatabase()
  await applySeed(db.drizzle, planSeed(config), config.consentVersion)
  const deps = composeApp(config, db.drizzle)
  app = createApp(deps)
  const [admin] = await db.query(
    "SELECT member_id FROM member_roles WHERE role_key = 'admin' LIMIT 1",
  )
  const [member] = await db.query('SELECT id FROM members WHERE email = ?', [
    'milan.horvat@example.invalid',
  ])
  milan = String(member?.['id'])
  const session = await deps.auth.createSession(milan)
  cookie = `${session.name}=${session.value}`
  await db.query(
    'INSERT INTO event_badges (id, name, ticket_line, big_line) VALUES (?, ?, ?, ?)',
    [badgeId, 'Stormed the Summit', 'SUMMIT', '2026'],
  )
  await insertInvites(String(admin?.['member_id']))
})

afterAll(async () => {
  await db.query('DELETE FROM members WHERE email = ?', [scanner])
  await db.query('DELETE FROM invites WHERE event_badge_id = ?', [badgeId])
  await db.query('DELETE FROM event_badges WHERE id = ?', [badgeId])
  await db.close()
})

function claim(token: unknown): request.Test {
  return request(app)
    .post('/api/badges/claim')
    .set('Cookie', cookie)
    .send({ invite: token })
}

async function earnedBy(memberId: string): Promise<unknown[]> {
  const rows = await db.query(
    'SELECT event_badge_id FROM member_event_badges WHERE member_id = ?',
    [memberId],
  )
  return rows.map((row) => row['event_badge_id'])
}

async function badgeNotesOf(memberId: string): Promise<unknown[]> {
  const rows = await db.query(
    "SELECT badge_row, event_badge_id FROM notifications WHERE type = 'badge' AND recipient_id = ? AND badge_row = 'event'",
    [memberId],
  )
  return rows.map((row) => [row['badge_row'], row['event_badge_id']])
}

async function usesOf(id: string): Promise<number> {
  const [row] = await db.query('SELECT uses FROM invites WHERE id = ?', [id])
  return Number(row?.['uses'])
}

describe('earning event badges over Postgres (R-BADGE-6)', () => {
  it('gives the badge with the membership of whoever joins through it', async () => {
    await request(app)
      .post('/auth/request-link')
      .send({ email: scanner, invite: invites.open.token })
      .expect(200)

    const [joined] = await db.query('SELECT id FROM members WHERE email = ?', [
      scanner,
    ])
    const id = String(joined?.['id'])
    expect(await earnedBy(id)).toEqual([badgeId])
    expect(await badgeNotesOf(id)).toEqual([['event', badgeId]])
    expect(await usesOf(invites.open.id)).toBe(1)
  })

  it.each(['revoked', 'expired', 'scheduled'] as const)(
    'gives nothing for a %s invite, and says nothing of it (R-INV-5)',
    async (which) => {
      await claim(invites[which].token).expect(204)

      expect(await earnedBy(milan)).toEqual([])
    },
  )

  it('says nothing of an unknown token, nor of no token at all', async () => {
    await claim('no-such-token').expect(204)
    await claim(42).expect(204)

    expect(await earnedBy(milan)).toEqual([])
  })

  it('gives a member already in the badge of a full invite, using no place (R-INV-4)', async () => {
    await claim(invites.full.token).expect(204)

    expect(await earnedBy(milan)).toEqual([badgeId])
    expect(await badgeNotesOf(milan)).toEqual([['event', badgeId]])
    expect(await usesOf(invites.full.id)).toBe(1)
  })

  it('gives each event badge once, notified once', async () => {
    await claim(invites.open.token).expect(204)

    expect(await earnedBy(milan)).toEqual([badgeId])
    expect(await badgeNotesOf(milan)).toHaveLength(1)
    expect(await usesOf(invites.open.id)).toBe(1)
  })

  it('shows it among the member’s badges, new, and in their notifications', async () => {
    const overview = (
      await request(app).get('/api/badges').set('Cookie', cookie).expect(200)
    ).body as BadgeOverview
    const listed = await request(app)
      .get('/api/notifications')
      .set('Cookie', cookie)
      .expect(200)

    expect(overview.events).toEqual([
      {
        id: badgeId,
        name: 'Stormed the Summit',
        ticketLine: 'SUMMIT',
        bigLine: '2026',
        hasLogo: false,
        earnedAt: expect.any(String) as unknown,
        new: true,
      },
    ])
    expect(
      (
        listed.body as {
          notifications: { kind: string; name: string; path: string }[]
        }
      ).notifications
        .filter((note) => note.kind === 'badge')
        .map((note) => [note.name, note.path]),
    ).toContainEqual(['Stormed the Summit', '/badges/events'])
  })

  it('stops being new once the event badges are seen (R-BADGE-10)', async () => {
    const before = await request(app)
      .get('/api/badges/new')
      .set('Cookie', cookie)
      .expect(200)

    await request(app)
      .post('/api/badges/seen')
      .set('Cookie', cookie)
      .send({ rows: ['event'] })
      .expect(204)

    const after = await request(app)
      .get('/api/badges/new')
      .set('Cookie', cookie)
      .expect(200)
    expect((before.body as { count: number }).count).toBe(
      (after.body as { count: number }).count + 1,
    )
    expect(
      await db.query(
        "SELECT id FROM notifications WHERE recipient_id = ? AND badge_row = 'event' AND seen_at IS NULL",
        [milan],
      ),
    ).toEqual([])
  })

  it('answers no one signed out', async () => {
    await request(app)
      .post('/api/badges/claim')
      .send({ invite: invites.open.token })
      .expect(401)
  })
})
