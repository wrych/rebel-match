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

const config = loadConfig({
  DATABASE_URL: testDatabaseUrl,
  SESSION_SECRET: 'integration-session-secret-of-32-chars',
  NODE_ENV: 'test',
})
const host = { id: randomUUID(), email: `${randomUUID()}@example.invalid` }
const invite = { id: randomUUID(), token: randomUUID() }

let db: TestDatabase
let app: ReturnType<typeof createApp>

const opens = async (): Promise<number> =>
  Number(
    (
      await db.query(
        'SELECT count(*) AS n FROM invite_opens WHERE invite_id = ?',
        [invite.id],
      )
    )[0]!['n'],
  )
const open = (token: string): request.Test =>
  request(app).post('/auth/invite-opened').send({ invite: token })

beforeAll(async () => {
  db = await openTestDatabase()
  await db.query(
    'INSERT INTO members (id, email, status, analytics_id) VALUES (?, ?, ?, ?)',
    [host.id, host.email, 'active', randomUUID()],
  )
  await db.query(
    'INSERT INTO invites (id, token, label, valid_from, valid_until, max_uses, created_by) ' +
      "VALUES (?, ?, 'Main stage', now(), now() + interval '1 day', 400, ?)",
    [invite.id, invite.token, host.id],
  )
  app = createApp(composeApp(config, db.drizzle))
})

afterAll(async () => {
  await db.query('DELETE FROM invites WHERE id = ?', [invite.id])
  await db.query('DELETE FROM members WHERE id = ?', [host.id])
  await db.close()
})

describe('invite opens over Postgres (R-STAT-6, ADR 0038)', () => {
  it('records every open of a known invite, and nothing about who', async () => {
    await open(invite.token).expect(204)
    await open(invite.token).expect(204)

    expect(await opens()).toBe(2)
    const columns = await db.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'invite_opens'",
    )
    expect(columns.map((c) => c['column_name']).sort()).toEqual([
      'id',
      'invite_id',
      'opened_at',
    ])
  })

  it('answers an unknown token the same and records nothing', async () => {
    const before = Number(
      (await db.query('SELECT count(*) AS n FROM invite_opens'))[0]!['n'],
    )

    await open('no-such-token').expect(204)

    expect(
      Number(
        (await db.query('SELECT count(*) AS n FROM invite_opens'))[0]!['n'],
      ),
    ).toBe(before)
  })

  it('goes with its invite', async () => {
    await db.query('DELETE FROM invites WHERE id = ?', [invite.id])

    expect(await opens()).toBe(0)
  })
})
