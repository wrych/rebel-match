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
import type {
  ModerationPage,
  ReportedMember,
} from '../../src/services/moderation.js'

const config = loadConfig({
  DATABASE_URL: testDatabaseUrl,
  SESSION_SECRET: 'integration-session-secret-of-32-chars',
  NODE_ENV: 'test',
  SEED_PROFILE: 'dev',
})
const body = 'Enrol in my paid rebel leadership programme, seats are limited.'
const note = randomUUID()

let db: TestDatabase
let app: ReturnType<typeof createApp>
let host: string
let cookies: Record<string, string>
let ids: Record<string, string>
let challengeId: string
let olaChallenge: string

async function idOf(email: string): Promise<string> {
  const rows = await db.query('SELECT id FROM members WHERE email = ?', [email])
  return String(rows[0]?.['id'])
}

function report(who: string, item: object, reason = 'spam'): request.Test {
  return request(app)
    .post('/api/reports')
    .set('Cookie', cookies[who]!)
    .send({ ...item, reason, comment: `From ${who}.` })
}

async function overview(state = 'open'): Promise<ReportedMember[]> {
  const response = await request(app)
    .get(`/api/admin/reports?state=${state}`)
    .set('Cookie', host)
    .expect(200)
  return (response.body as { members: ReportedMember[] }).members
}

async function pageOf(memberId: string): Promise<ModerationPage> {
  const response = await request(app)
    .get(`/api/admin/reports/${memberId}`)
    .set('Cookie', host)
    .expect(200)
  return response.body as ModerationPage
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
  ids = {}
  cookies = {}
  for (const [who, email] of [
    ['sanne', 'sanne.kuipers@example.invalid'],
    ['milan', 'milan.horvat@example.invalid'],
    ['priya', 'priya.raman@example.invalid'],
    ['jonas', 'jonas.brand@example.invalid'],
    ['ola', 'ola.nyberg@example.invalid'],
  ] as const) {
    ids[who] = await idOf(email)
    cookies[who] = await cookie(ids[who])
  }
  host = await cookie(await idOf(DEV_ADMIN_EMAIL))
  await db.query(
    'DELETE FROM reports WHERE reported_id IN (?, ?) OR reporter_id IN (?, ?, ?)',
    [ids['sanne'], ids['ola'], ids['milan'], ids['priya'], ids['jonas']],
  )

  const created = await request(app)
    .post('/api/challenges')
    .set('Cookie', cookies['sanne']!)
    .send({ body })
    .expect(201)
  challengeId = (created.body as { challenge: { id: string } }).challenge.id
  await request(app)
    .patch(`/api/challenges/${challengeId}`)
    .set('Cookie', cookies['sanne']!)
    .send({ trendId: '06' })
    .expect(204)
  await db.query(
    `INSERT INTO connection_requests (id, requester_id, target_id, kind, message, status)
     VALUES (?, ?, ?, 'been_there', 'Use my code REBEL50.', 'accepted')`,
    [note, ids['sanne'], ids['milan']],
  )
  const [ola] = await db.query(
    "SELECT id FROM challenges WHERE member_id = ? AND status = 'active' LIMIT 1",
    [ids['ola']],
  )
  olaChallenge = String(ola?.['id'])

  await report('milan', { challengeId }).expect(204)
  await report('priya', { challengeId }).expect(204)
  await report('jonas', { challengeId }, 'inappropriate').expect(204)
  await report('milan', { requestId: note }).expect(204)
  await report('jonas', { challengeId: olaChallenge }, 'other').expect(204)
})

afterAll(async () => {
  await db.query('DELETE FROM moderation_actions WHERE member_id IN (?, ?)', [
    ids['sanne'],
    ids['ola'],
  ])
  await db.query('DELETE FROM reports WHERE reported_id IN (?, ?)', [
    ids['sanne'],
    ids['ola'],
  ])
  await db.query('DELETE FROM connection_requests WHERE id = ?', [note])
  await db.query('DELETE FROM notifications WHERE challenge_id = ?', [
    challengeId,
  ])
  await db.query('DELETE FROM challenges WHERE id = ?', [challengeId])
  await db.close()
})

describe('moderation over Postgres (F21, R-MOD-6..8)', () => {
  it('shows a member without report:review nothing (R-MOD-12)', async () => {
    await request(app)
      .get('/api/admin/reports')
      .set('Cookie', cookies['milan']!)
      .expect(404)
    await request(app)
      .get(`/api/admin/reports/${ids['sanne']!}`)
      .set('Cookie', cookies['milan']!)
      .expect(404)
  })

  it('lists reported members by how many different members reported them (R-MOD-6)', async () => {
    const members = await overview()
    const ours = members.filter((each) =>
      [ids['sanne'], ids['ola']].includes(each.memberId),
    )

    expect(ours.map((each) => each.memberId)).toEqual([
      ids['sanne'],
      ids['ola'],
    ])
    expect(ours[0]).toMatchObject({
      name: 'Sanne Kuipers',
      status: 'active',
      reports: 4,
      reporters: 3,
      challenges: 1,
      notes: 1,
      reasons: [
        { reason: 'spam', count: 3 },
        { reason: 'inappropriate', count: 1 },
      ],
    })
    expect(ours[1]).toMatchObject({ reports: 1, reporters: 1 })
  })

  it('shows each reported item with its reports and who made them (R-MOD-7)', async () => {
    const page = await pageOf(ids['sanne']!)

    expect(page.member).toMatchObject({ name: 'Sanne Kuipers' })
    expect(page.open).toEqual({ reports: 4, reporters: 3 })
    expect(page.items.map((item) => [item.kind, item.id])).toEqual([
      ['challenge', challengeId],
      ['note', note],
    ])
    expect(page.items[0]).toMatchObject({ body, state: 'shown' })
    expect(page.items[0]?.reports.map((each) => each.reporter).sort()).toEqual([
      'Jonas Brand',
      'Milan Horvat',
      'Priya Raman',
    ])
    expect(page.items[1]).toMatchObject({
      body: 'Use my code REBEL50.',
      sentTo: 'Milan Horvat',
    })
    expect(page.items[1]?.reports[0]).toMatchObject({
      reason: 'spam',
      comment: 'From milan.',
      open: true,
    })
  })

  it('dismisses an item’s reports once, recording who did (R-MOD-7)', async () => {
    await request(app)
      .post('/api/admin/reports/dismiss')
      .set('Cookie', host)
      .send({ requestId: note })
      .expect(204)
    await request(app)
      .post('/api/admin/reports/dismiss')
      .set('Cookie', host)
      .send({ requestId: note })
      .expect(404)

    const page = await pageOf(ids['sanne']!)
    expect(page.items[1]?.reports[0]?.open).toBe(false)
    expect(page.history[0]).toMatchObject({
      kind: 'dismiss',
      actor: 'Dev Admin',
      item: 'note',
    })
  })

  it('handles a challenge’s reports by hiding it, moving the member to Handled (R-MOD-8)', async () => {
    await request(app)
      .post(`/api/admin/challenges/${challengeId}/hide`)
      .set('Cookie', host)
      .send({ reason: 'spam' })
      .expect(204)

    const open = await overview()
    const handled = await overview('handled')
    const page = await pageOf(ids['sanne']!)

    expect(open.map((each) => each.memberId)).not.toContain(ids['sanne'])
    expect(
      handled.find((each) => each.memberId === ids['sanne']),
    ).toMatchObject({ reports: 4, reporters: 3 })
    expect(page.items[0]).toMatchObject({
      state: 'hidden',
      hiddenReason: 'spam',
    })
    expect(page.history[0]).toMatchObject({
      kind: 'hide',
      item: 'challenge',
      reason: 'spam',
    })
  })

  it('records an unhide in the history', async () => {
    await request(app)
      .post(`/api/admin/challenges/${challengeId}/unhide`)
      .set('Cookie', host)
      .expect(204)

    const page = await pageOf(ids['sanne']!)
    expect(page.history.map((each) => each.kind)).toEqual([
      'unhide',
      'hide',
      'dismiss',
    ])
  })

  it('brings a handled member back to Open with a new report', async () => {
    await report('priya', { requestId: note }).expect(404)
    await report('ola', { challengeId }).expect(204)

    expect((await overview()).map((each) => each.memberId)).toContain(
      ids['sanne'],
    )
  })
})
