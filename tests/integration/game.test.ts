import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { composeApp } from '../../src/compose.js'
import { loadConfig } from '../../src/config.js'
import type {
  DayResult,
  GameState,
  Leaderboard,
} from '../../src/services/game.js'
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
let deps: ReturnType<typeof composeApp>
let app: ReturnType<typeof createApp>
const created: string[] = []

async function newMember(): Promise<{ id: string; cookie: string }> {
  const id = randomUUID()
  created.push(id)
  await db.query(
    "INSERT INTO members (id, email, name, status, analytics_id, consent_version, consent_at) VALUES (?, ?, 'Pat Player', 'active', ?, ?, now())",
    [
      id,
      `${randomUUID()}@example.invalid`,
      randomUUID(),
      config.consentVersion,
    ],
  )
  await db.query(
    "INSERT INTO member_roles (member_id, role_key) VALUES (?, 'member')",
    [id],
  )
  const session = await deps.auth.createSession(id)
  return { id, cookie: `${session.name}=${session.value}` }
}

async function count(table: string, memberId: string): Promise<number> {
  const rows = await db.query(
    `SELECT count(*)::int AS n FROM ${table} WHERE member_id = ?`,
    [memberId],
  )
  return Number(rows[0]?.['n'])
}

const stateIn = (response: request.Response): GameState =>
  response.body as GameState
const placeIn = (response: request.Response): DayResult['place'] =>
  (response.body as DayResult).place

const day = (
  cookie: string,
  body: { level: number; outcome: string; playSeconds: number },
): request.Test =>
  request(app).post('/api/game/days').set('Cookie', cookie).send(body)

beforeAll(async () => {
  db = await openTestDatabase()
  await applySeed(db.drizzle, planSeed(config), config.consentVersion)
  deps = composeApp(config, db.drizzle)
  app = createApp(deps)
  const host = await newMember()
  await deps.settings.change('game.enabled', 1, host.id)
})

afterAll(async () => {
  await db.query('DELETE FROM setting_overrides WHERE key = ?', [
    'game.enabled',
  ])
  for (const id of created)
    await db.query('DELETE FROM members WHERE id = ?', [id])
  await db.close()
})

describe('9toRevolution over Postgres (R-GAME-13..16)', () => {
  it('keeps a player with a unique pseudonym and their progress', async () => {
    const ada = await newMember()
    const bo = await newMember()

    const first = await request(app)
      .get('/api/game')
      .set('Cookie', ada.cookie)
      .expect(200)
    const other = await request(app)
      .get('/api/game')
      .set('Cookie', bo.cookie)
      .expect(200)
    await day(ada.cookie, { level: 1, outcome: 'won', playSeconds: 70 }).expect(
      200,
    )
    const again = await request(app)
      .get('/api/game')
      .set('Cookie', ada.cookie)
      .expect(200)

    expect(stateIn(other).pseudonym).not.toBe(stateIn(first).pseudonym)
    expect(stateIn(again)).toMatchObject({
      pseudonym: stateIn(first).pseudonym,
      highestLevel: 2,
      best: { level: 1, seconds: 70 },
    })
  })

  it('places a best among active players, ahead of a slower one', async () => {
    const fast = await newMember()
    const slow = await newMember()
    await day(slow.cookie, {
      level: 1,
      outcome: 'won',
      playSeconds: 200,
    }).expect(200)

    const answer = await day(fast.cookie, {
      level: 1,
      outcome: 'won',
      playSeconds: 30,
    }).expect(200)
    const before = placeIn(answer) ?? { position: 0, of: 0 }
    await db.query("UPDATE members SET status = 'deleted' WHERE id = ?", [
      fast.id,
    ])
    const after = await day(slow.cookie, {
      level: 1,
      outcome: 'lost',
      playSeconds: 10,
    }).expect(200)

    expect(before.position).toBeLessThan(before.of)
    expect(placeIn(after)?.of).toBe(before.of - 1)
  })

  it('records a hint once', async () => {
    const ada = await newMember()

    await request(app)
      .put('/api/game/hints/meeting')
      .set('Cookie', ada.cookie)
      .expect(204)
    await request(app)
      .put('/api/game/hints/meeting')
      .set('Cookie', ada.cookie)
      .expect(204)
    const state = await request(app).get('/api/game').set('Cookie', ada.cookie)

    expect(stateIn(state).hintsSeen).toEqual(['meeting'])
  })

  it('deletes the day log with the history, and keeps the best (R-STAT-4)', async () => {
    const ada = await newMember()
    await day(ada.cookie, { level: 1, outcome: 'won', playSeconds: 60 }).expect(
      200,
    )

    await request(app)
      .delete('/api/me/history')
      .set('Cookie', ada.cookie)
      .expect(204)
    const state = await request(app).get('/api/game').set('Cookie', ada.cookie)

    expect(await count('game_days', ada.id)).toBe(0)
    expect(stateIn(state).best).toEqual({ level: 1, seconds: 60 })
  })

  it('goes with the member when they are erased (R-NFR-7)', async () => {
    const ada = await newMember()
    await day(ada.cookie, { level: 1, outcome: 'won', playSeconds: 60 }).expect(
      200,
    )

    await db.query('DELETE FROM members WHERE id = ?', [ada.id])

    expect(await count('game_days', ada.id)).toBe(0)
    expect(await count('game_players', ada.id)).toBe(0)
  })

  it('ranks the board, shows a shared name, and keeps ids and deleted members off it (R-GAME-13, R-GAME-15)', async () => {
    const best = await newMember()
    const tied = [await newMember(), await newMember()]
    const gone = await newMember()
    await day(best.cookie, { level: 1, outcome: 'won', playSeconds: 1 }).expect(
      200,
    )
    await day(best.cookie, { level: 2, outcome: 'won', playSeconds: 1 }).expect(
      200,
    )
    for (const member of tied)
      await day(member.cookie, {
        level: 1,
        outcome: 'won',
        playSeconds: 2,
      }).expect(200)
    await day(gone.cookie, { level: 1, outcome: 'won', playSeconds: 1 }).expect(
      200,
    )
    await db.query("UPDATE members SET status = 'deleted' WHERE id = ?", [
      gone.id,
    ])
    await request(app)
      .put('/api/game/sharing')
      .set('Cookie', best.cookie)
      .send({ shared: true })
      .expect(204)

    const answer = await request(app)
      .get('/api/game/leaderboard')
      .set('Cookie', tied[0]?.cookie ?? '')
      .expect(200)
    const board = answer.body as Leaderboard
    const all = [...board.rows, ...(board.own === null ? [] : [board.own])]
    const named = all.find((row) => row.name === 'Pat Player')
    const mine = all.find((row) => row.mine)

    expect(named).toMatchObject({ level: 2, job: 'teamLead' })
    expect(all.filter((row) => row.place === mine?.place)).toHaveLength(2)
    expect(JSON.stringify(board)).not.toMatch(
      new RegExp([best.id, gone.id, ...tied.map((t) => t.id)].join('|')),
    )
    expect(board.of).toBe(all.length)
  })
})
