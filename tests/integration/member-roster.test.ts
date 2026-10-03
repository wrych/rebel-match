import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadConfig } from '../../src/config.js'
import { planSeed } from '../../src/seed/plan.js'
import { applySeed } from '../../src/seed/run.js'
import { createMemberRoster } from '../../src/services/member-roster-store.js'
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
const host = { id: randomUUID(), email: `a-${randomUUID()}@example.invalid` }
const asker = { id: randomUUID(), email: `b-${randomUUID()}@example.invalid` }

let db: TestDatabase

beforeAll(async () => {
  db = await openTestDatabase()
  await applySeed(db.drizzle, { ...planSeed(config), members: [] }, '')
  await db.query(
    'INSERT INTO members (id, email, name, status, analytics_id) VALUES ' +
      "(?, ?, 'Hana', 'active', ?), (?, ?, NULL, 'applicant', ?)",
    [host.id, host.email, randomUUID(), asker.id, asker.email, randomUUID()],
  )
  await db.query(
    "INSERT INTO member_roles (member_id, role_key) VALUES (?, 'member'), (?, 'admin')",
    [host.id, host.id],
  )
})

afterAll(async () => {
  await db.query('DELETE FROM members WHERE id IN (?)', [[host.id, asker.id]])
  await db.close()
})

describe('the member roster over Postgres (R-NFR-7)', () => {
  it('lists each member once, with their roles, by email', async () => {
    const ours = new Set<string>([host.id, asker.id])
    const listed = (await createMemberRoster(db.drizzle).list()).filter((m) =>
      ours.has(m.id),
    )

    expect(listed).toEqual([
      {
        id: host.id,
        email: host.email,
        name: 'Hana',
        status: 'active',
        roles: ['admin', 'member'],
        joinedAt: expect.any(String) as string,
      },
      {
        id: asker.id,
        email: asker.email,
        name: null,
        status: 'applicant',
        roles: [],
        joinedAt: expect.any(String) as string,
      },
    ])
  })
})
