import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import type { AppDeps } from '../../src/app.js'
import { composeApp } from '../../src/compose.js'
import { loadConfig } from '../../src/config.js'
import type { BadgeOverview, RowView } from '../../src/services/badges.js'
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
})

let db: TestDatabase
let deps: AppDeps
let app: ReturnType<typeof createApp>
const ids: Record<string, string> = {}
const cookies: Record<string, string> = {}
const people = [
  'ana.ferreira',
  'marieke.de.wit',
  'milan.horvat',
  'sanne.kuipers',
]

async function cleanup(): Promise<void> {
  const [ana, marieke] = [ids['ana.ferreira'], ids['marieke.de.wit']]
  await db.query(
    'DELETE FROM connection_requests WHERE requester_id IN (?, ?)',
    [ana, marieke],
  )
  await db.query('DELETE FROM swipes WHERE member_id = ?', [marieke])
  await db.query('DELETE FROM challenges WHERE member_id = ?', [ana])
  await db.query('DELETE FROM member_badges')
  await db.query('DELETE FROM badge_crowns')
  await db.query('DELETE FROM badge_launch')
  await db.query("DELETE FROM notifications WHERE type = 'badge'")
  await db.query("DELETE FROM outbox WHERE kind = 'badge'")
  await db.query('DELETE FROM notification_settings WHERE member_id = ?', [ana])
  await db.query('DELETE FROM game_players WHERE member_id IN (?, ?)', [
    ana,
    marieke,
  ])
  await db.query("DELETE FROM setting_overrides WHERE key = 'game.enabled'")
}

beforeAll(async () => {
  db = await openTestDatabase()
  await applySeed(db.drizzle, planSeed(config), config.consentVersion)
  deps = composeApp(config, db.drizzle)
  app = createApp(deps)
  for (const person of people) {
    const rows = await db.query('SELECT id FROM members WHERE email = ?', [
      `${person}@example.invalid`,
    ])
    ids[person] = String(rows[0]?.['id'])
    const session = await deps.auth.createSession(ids[person])
    cookies[person] = `${session.name}=${session.value}`
  }
  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await db.close()
})

async function badgesOf(person: string): Promise<BadgeOverview> {
  const response = await request(app)
    .get('/api/badges')
    .set('Cookie', cookies[person]!)
  expect(response.status).toBe(200)
  return response.body as BadgeOverview
}

async function rowOf(person: string, row: string): Promise<RowView> {
  return (await badgesOf(person)).rows.find((each) => each.row === row)!
}

const earned = (row: RowView): [string, boolean][] =>
  row.levels
    .filter((level) => level.earnedAt !== null)
    .map((level) => [level.name, level.new])

async function post(person: string, body: string): Promise<void> {
  const posted = await request(app)
    .post('/api/challenges')
    .set('Cookie', cookies[person]!)
    .send({ body })
    .expect(201)
  await request(app)
    .patch(
      `/api/challenges/${(posted.body as { challenge: { id: string } }).challenge.id}`,
    )
    .set('Cookie', cookies[person]!)
    .send({ trendId: '05' })
    .expect(204)
}

async function speakCrownHolder(): Promise<unknown> {
  const [crown] = await db.query(
    "SELECT member_id FROM badge_crowns WHERE row_key = 'speak'",
  )
  return crown?.['member_id']
}

async function challengeOf(person: string): Promise<string> {
  const rows = await db.query('SELECT id FROM challenges WHERE member_id = ?', [
    ids[person],
  ])
  return String(rows[0]?.['id'])
}

describe('badges over Postgres (R-BADGE-1, R-BADGE-2)', () => {
  it('records what was earned before launch quietly, once (R-BADGE-11)', async () => {
    await deps.badges.awardAtLaunch()
    await deps.badges.awardAtLaunch()
    await deps.badges.checkCrowns()

    expect(earned(await rowOf('sanne.kuipers', 'speak'))).toEqual([
      ['Spark', false],
    ])
    expect(await db.query('SELECT done_at FROM badge_launch')).toHaveLength(1)
    expect(
      await db.query('SELECT row_key FROM badge_crowns WHERE seen_at IS NULL'),
    ).toEqual([])
  })

  it('counts a challenge once its trend is confirmed, as new', async () => {
    const posted = await request(app)
      .post('/api/challenges')
      .set('Cookie', cookies['ana.ferreira']!)
      .send({
        body: 'Our managers say they want self-organising teams, then overrule every decision the teams make.',
      })
    expect(posted.status).toBe(201)
    const id = (posted.body as { challenge: { id: string } }).challenge.id
    expect((await rowOf('ana.ferreira', 'speak')).count).toBe(0)

    await request(app)
      .patch(`/api/challenges/${id}`)
      .set('Cookie', cookies['ana.ferreira']!)
      .send({ trendId: '03' })
      .expect(204)

    const speak = await rowOf('ana.ferreira', 'speak')
    expect(speak.count).toBe(1)
    expect(earned(speak)).toEqual([['Spark', true]])
  })

  it('notifies a level gained in the app, linking its row (R-BADGE-10)', async () => {
    const listed = await request(app)
      .get('/api/notifications')
      .set('Cookie', cookies['ana.ferreira']!)
      .expect(200)

    const badges = (
      listed.body as {
        notifications: { kind: string; name: string; path: string }[]
      }
    ).notifications.filter((note) => note.kind === 'badge')
    expect(badges.map((note) => [note.name, note.path])).toEqual([
      ['Spark', '/badges/speak'],
    ])
  })

  it('mails it at the cadence the member chose', async () => {
    await request(app)
      .put('/api/me/notification-settings/badge')
      .set('Cookie', cookies['ana.ferreira']!)
      .send({ cadence: 'immediately' })
      .expect(204)

    await deps.notificationMail.deliverDue()

    const mailed = await db.query(
      "SELECT subject FROM outbox WHERE kind = 'badge' AND member_id = ?",
      [ids['ana.ferreira']],
    )
    expect(mailed.map((row) => row['subject'])).toEqual([
      'New badge on Rebel Match: Spark',
    ])
  })

  it('counts a "been there" from the deck as help offered', async () => {
    await request(app)
      .post('/api/swipe')
      .set('Cookie', cookies['marieke.de.wit']!)
      .send({
        challengeId: await challengeOf('sanne.kuipers'),
        action: 'been_there',
        note: 'We mapped every decision to a role in one afternoon; happy to share.',
      })
      .expect(201)

    const help = await rowOf('marieke.de.wit', 'help')
    expect(help.count).toBe(1)
    expect(earned(help)).toEqual([['Ally', true]])
  })

  it('does not count asking someone who has been there as help offered', async () => {
    await request(app)
      .post('/api/connections')
      .set('Cookie', cookies['ana.ferreira']!)
      .send({
        targetId: ids['milan.horvat'],
        challengeId: await challengeOf('ana.ferreira'),
        kind: 'been_there',
        message: 'You seem to have lived this one. Could we talk?',
      })
      .expect(201)

    expect((await rowOf('ana.ferreira', 'help')).count).toBe(0)
  })

  it('counts a same-boat request, then the connection for both once accepted', async () => {
    const sent = await request(app)
      .post('/api/connections')
      .set('Cookie', cookies['ana.ferreira']!)
      .send({ targetId: ids['sanne.kuipers'], kind: 'same_boat' })
      .expect(201)
    expect((await rowOf('ana.ferreira', 'boat')).count).toBe(1)
    expect((await rowOf('ana.ferreira', 'connect')).count).toBe(0)

    await request(app)
      .post(`/api/connections/${(sent.body as { id: string }).id}/accept`)
      .set('Cookie', cookies['sanne.kuipers']!)
      .expect(204)

    expect(earned(await rowOf('ana.ferreira', 'connect'))).toEqual([
      ['Co-conspirator', true],
    ])
    expect(earned(await rowOf('sanne.kuipers', 'connect'))).toEqual([
      ['Co-conspirator', true],
    ])
  })

  it('keeps a level when its count falls', async () => {
    await db.query('DELETE FROM challenges WHERE member_id = ?', [
      ids['ana.ferreira'],
    ])

    const speak = await rowOf('ana.ferreira', 'speak')
    expect(speak.count).toBe(0)
    expect(earned(speak)).toEqual([['Spark', true]])
  })

  it('shows a member only their own badges (R-BADGE-12)', async () => {
    const milan = await badgesOf('milan.horvat')

    expect(milan.rows.find((row) => row.row === 'connect')?.count).toBe(0)
    expect(JSON.stringify(milan)).not.toContain(ids['ana.ferreira'])
  })

  it('moves a crown to a member who passes everyone, as new (R-BADGE-3)', async () => {
    await post(
      'ana.ferreira',
      'Every team has a different definition of done, and nobody wants to be the one to align them.',
    )
    await post(
      'ana.ferreira',
      'We promised autonomy, but the budget still sits with three people who never meet the teams.',
    )

    expect((await rowOf('ana.ferreira', 'speak')).crown).toEqual({
      name: 'Ringleader',
      held: true,
      new: true,
    })
    expect((await rowOf('sanne.kuipers', 'speak')).crown.held).toBe(false)
  })

  it("takes a deleted member's crowns at once, and checks pass them back on restore", async () => {
    await deps.erasure.delete(ids['ana.ferreira']!, true)
    expect(await speakCrownHolder()).toBeNull()

    await deps.erasure.restore(ids['ana.ferreira']!)
    const session = await deps.auth.createSession(ids['ana.ferreira']!)
    cookies['ana.ferreira'] = `${session.name}=${session.value}`
    await deps.badges.checkCrowns()

    expect(await speakCrownHolder()).toBe(ids['ana.ferreira'])
  })

  it('counts new badges until their row is seen (R-BADGE-10)', async () => {
    const fresh = async (person: string): Promise<number> =>
      (
        (
          await request(app)
            .get('/api/badges/new')
            .set('Cookie', cookies[person]!)
            .expect(200)
        ).body as { count: number }
      ).count
    const before = await fresh('ana.ferreira')
    expect(before).toBeGreaterThan(0)

    await request(app)
      .post('/api/badges/seen')
      .set('Cookie', cookies['ana.ferreira']!)
      .send({ rows: ['speak', 'boat', 'connect'] })
      .expect(204)

    expect(await fresh('ana.ferreira')).toBe(0)
    expect(
      await db.query(
        "SELECT id FROM notifications WHERE type = 'badge' AND recipient_id = ? AND badge_row = 'speak' AND seen_at IS NULL",
        [ids['ana.ferreira']],
      ),
    ).toEqual([])
    expect(
      (await rowOf('ana.ferreira', 'speak')).levels.some((level) => level.new),
    ).toBe(false)
  })

  it('refuses a row that does not exist', async () => {
    await request(app)
      .post('/api/badges/seen')
      .set('Cookie', cookies['ana.ferreira']!)
      .send({ rows: ['gossip'] })
      .expect(400)
  })

  it('counts promotions from the game while it is on, saying nothing of how (R-BADGE-9)', async () => {
    expect(
      (await badgesOf('marieke.de.wit')).rows.map((row) => row.row),
    ).not.toContain('game')
    await deps.settings.change('game.enabled', 1, ids['marieke.de.wit']!)

    await request(app)
      .get('/api/game')
      .set('Cookie', cookies['marieke.de.wit']!)
      .expect(200)
    expect(earned(await rowOf('marieke.de.wit', 'game'))).toEqual([
      ['Team Lead', true],
    ])

    await db.query(
      'UPDATE game_players SET highest_level = 7 WHERE member_id = ?',
      [ids['marieke.de.wit']],
    )
    await request(app)
      .get('/api/game')
      .set('Cookie', cookies['marieke.de.wit']!)
      .expect(200)

    const game = await rowOf('marieke.de.wit', 'game')
    expect(earned(game).map(([name]) => name)).toEqual([
      'Team Lead',
      'Manager',
      'Director',
    ])
    expect(game.explains).toBe('')
  })

  it('records promotions reached before they counted, quietly (R-BADGE-11)', async () => {
    await db.query(
      "DELETE FROM member_badges WHERE row_key = 'game' AND member_id = ?",
      [ids['marieke.de.wit']],
    )
    const migration = readFileSync(
      new URL('../../db/migrations/0021_badge_promotions.sql', import.meta.url),
      'utf8',
    )

    await db.query(migration, [])

    expect(earned(await rowOf('marieke.de.wit', 'game'))).toEqual([
      ['Team Lead', false],
      ['Manager', false],
      ['Director', false],
    ])
  })

  it('gives a tie at the top to whoever won their way there first (R-BADGE-3)', async () => {
    const [ana, marieke] = [ids['ana.ferreira']!, ids['marieke.de.wit']!]
    await db.query(
      "INSERT INTO game_players (member_id, pseudonym, highest_level) VALUES (?, 'Tied Rebel', 13)",
      [ana],
    )
    await db.query(
      'UPDATE game_players SET highest_level = 13 WHERE member_id = ?',
      [marieke],
    )
    await db.query(
      "INSERT INTO game_days (id, member_id, level, outcome, play_seconds, finished_at) VALUES (?, ?, 12, 'won', 60, '2026-11-08T10:00:00Z'), (?, ?, 12, 'won', 60, '2026-11-08T11:00:00Z')",
      [randomUUID(), ana, randomUUID(), marieke],
    )
    await db.query(
      "UPDATE game_players SET updated_at = '2026-11-08T09:00:00Z' WHERE member_id = ?",
      [marieke],
    )
    await db.query("DELETE FROM badge_crowns WHERE row_key = 'game'")

    await deps.badges.checkCrowns()

    const [crown] = await db.query(
      "SELECT member_id FROM badge_crowns WHERE row_key = 'game'",
    )
    expect(crown?.['member_id']).toBe(ana)
    await db.query('DELETE FROM game_days WHERE member_id IN (?, ?)', [
      ana,
      marieke,
    ])
  })

  it('answers no one signed out', async () => {
    await request(app).get('/api/badges').expect(401)
  })
})
