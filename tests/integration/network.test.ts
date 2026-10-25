import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { composeApp } from '../../src/compose.js'
import { loadConfig } from '../../src/config.js'
import type { NetworkTimeline } from '../../src/network/timeline.js'
import { planSeed } from '../../src/seed/plan.js'
import { applySeed } from '../../src/seed/run.js'
import {
  openTestDatabase,
  testDatabaseUrl,
  type TestDatabase,
} from './support/database.js'

const config = loadConfig({
  DATABASE_URL: testDatabaseUrl,
  SESSION_SECRET: 'integration-session-secret-of-32-chars',
  NODE_ENV: 'test',
  SEED_PROFILE: 'dev',
  NETWORK_REPLAY: '1',
})
const member = 'milan.horvat@example.invalid'

let db: TestDatabase
let app: ReturnType<typeof createApp>
let cookie: string
let memberId: string

async function network(): Promise<NetworkTimeline> {
  const response = await request(app).get('/api/network').set('Cookie', cookie)
  expect(response.status).toBe(200)
  return response.body as NetworkTimeline
}

async function activeMembers(): Promise<number> {
  const rows = await db.query(
    `SELECT count(*)::int AS n FROM members
      WHERE status = 'active' AND name IS NOT NULL AND consent_at IS NOT NULL`,
  )
  return Number(rows[0]?.['n'])
}

beforeAll(async () => {
  db = await openTestDatabase()
  await applySeed(db.drizzle, planSeed(config), config.consentVersion)
  const deps = composeApp(config, db.drizzle)
  app = createApp(deps)
  const rows = await db.query('SELECT id FROM members WHERE email = ?', [
    member,
  ])
  memberId = String(rows[0]?.['id'])
  const session = await deps.auth.createSession(memberId)
  cookie = `${session.name}=${session.value}`
})

afterAll(async () => {
  await db.query("DELETE FROM connection_requests WHERE id LIKE 'net-%'")
  await db.close()
})

describe('the network replay over Postgres (R-NET-1..4)', () => {
  it('shows every onboarded member once, the caller marked', async () => {
    const { nodes } = await network()

    expect(nodes).toHaveLength(await activeMembers())
    expect(nodes.filter((node) => node.self)).toHaveLength(1)
  })

  it('circles each shown challenge around its author, text left out (R-NET-11)', async () => {
    const rows = await db.query(
      `SELECT count(*)::int AS n FROM challenges c JOIN members m ON m.id = c.member_id
        WHERE c.status = 'active' AND c.hidden_at IS NULL AND m.status = 'active'
          AND m.name IS NOT NULL AND m.consent_at IS NOT NULL`,
    )
    const body = await db.query('SELECT body FROM challenges LIMIT 1')
    const timeline = await network()

    expect(timeline.moons).toHaveLength(Number(rows[0]?.['n']))
    expect(JSON.stringify(timeline)).not.toContain(String(body[0]?.['body']))
  })

  it('names nobody and carries no id', async () => {
    const shown = JSON.stringify(await network())

    expect(shown).not.toContain(memberId)
    expect(shown).not.toContain('@')
    expect(shown).not.toMatch(/Milan|Horvat/)
  })

  it('draws an accepted connection, and not a pending or declined one', async () => {
    const before = (await network()).links.length
    const peers = await db.query(
      `SELECT id FROM members WHERE status = 'active' AND name IS NOT NULL
        AND consent_at IS NOT NULL AND id <> ? ORDER BY id LIMIT 3`,
      [memberId],
    )
    const [a, b, c] = peers.map((row) => String(row['id']))
    await db.query(
      `INSERT INTO connection_requests
         (id, requester_id, target_id, kind, status, responded_at)
       VALUES ('net-1', ?, ?, 'same_boat', 'accepted', now()),
              ('net-2', ?, ?, 'same_boat', 'pending', NULL),
              ('net-3', ?, ?, 'same_boat', 'declined', now())`,
      [memberId, a, memberId, b, memberId, c],
    )

    const { nodes, links } = await network()
    const self = nodes.findIndex((node) => node.self)

    expect(links).toHaveLength(before + 1)
    expect(
      links.some((link) => link.source === self || link.target === self),
    ).toBe(true)
  })
})
