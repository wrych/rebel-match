import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadConfig } from '../../src/config.js'
import { planSeed } from '../../src/seed/plan.js'
import { applySeed } from '../../src/seed/run.js'
import { createWhitelistStore } from '../../src/services/whitelist-store.js'
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
const address = (): string => `${randomUUID()}@example.invalid`
const host = { id: randomUUID(), email: address() }
const emails: string[] = []

let db: TestDatabase

async function addMember(status: string): Promise<string> {
  const email = address()
  await db.query(
    'INSERT INTO members (id, email, status, analytics_id) VALUES (?, ?, ?, ?)',
    [randomUUID(), email, status, randomUUID()],
  )
  emails.push(email)
  return email
}

async function stateOf(
  email: string,
): Promise<{ status: unknown; roles: unknown[]; grantedBy: unknown[] }> {
  const rows = await db.query(
    'SELECT m.status, r.role_key, r.granted_by FROM members m ' +
      'LEFT JOIN member_roles r ON r.member_id = m.id WHERE m.email = ?',
    [email],
  )
  return {
    status: rows[0]?.['status'],
    roles: rows.flatMap((row) => (row['role_key'] ? [row['role_key']] : [])),
    grantedBy: rows.flatMap((row) =>
      row['granted_by'] ? [row['granted_by']] : [],
    ),
  }
}

beforeAll(async () => {
  db = await openTestDatabase()
  await applySeed(db.drizzle, { ...planSeed(config), members: [] }, '')
  await db.query(
    "INSERT INTO members (id, email, status, analytics_id) VALUES (?, ?, 'active', ?)",
    [host.id, host.email, randomUUID()],
  )
  emails.push(host.email)
})

afterAll(async () => {
  await db.query('DELETE FROM members WHERE email IN (?)', [emails])
  await db.close()
})

describe('the whitelist over Postgres (R-AUTH-1)', () => {
  it('adds, admits, skips and keeps out, in one go', async () => {
    const fresh = address()
    emails.push(fresh)
    const applicant = await addMember('applicant')
    const active = await addMember('active')
    const rejected = await addMember('rejected')

    const results = await createWhitelistStore(db.drizzle).add(
      [fresh, applicant, active, rejected],
      'member',
      host.id,
    )

    expect(results.map((r) => r.outcome)).toEqual([
      'added',
      'admitted',
      'already_active',
      'kept_out',
    ])
    expect(await stateOf(fresh)).toEqual({
      status: 'active',
      roles: ['member'],
      grantedBy: [host.id],
    })
    expect(await stateOf(applicant)).toEqual({
      status: 'active',
      roles: ['member'],
      grantedBy: [host.id],
    })
    expect((await stateOf(rejected)).status).toBe('rejected')
    expect((await stateOf(rejected)).roles).toEqual([])
  })

  it('leaves a new member not yet onboarded, with no consent (R-ONB-3)', async () => {
    const fresh = address()
    emails.push(fresh)

    await createWhitelistStore(db.drizzle).add([fresh], 'member', host.id)

    const [row] = await db.query(
      'SELECT name, consent_at FROM members WHERE email = ?',
      [fresh],
    )
    expect(row).toEqual({ name: null, consent_at: null })
  })
})
