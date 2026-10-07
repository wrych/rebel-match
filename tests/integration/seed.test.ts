import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadConfig } from '../../src/config.js'
import {
  openTestDatabase,
  testDatabaseUrl,
  type TestDatabase,
} from './support/database.js'
import { DEV_ADMIN_EMAIL } from '../../src/seed/dev/people.js'
import { planSeed } from '../../src/seed/plan.js'
import { applySeed } from '../../src/seed/run.js'

const config = loadConfig({
  DATABASE_URL: testDatabaseUrl,
  SESSION_SECRET: 'integration-session-secret-of-32-chars',
  NODE_ENV: 'test',
  SEED_PROFILE: 'dev',
})
const plan = planSeed(config)
const emails = plan.members.map((member) => member.email)

let db: TestDatabase

// Counts across the seeded members when the query asks for them with `?`.
async function count(sql: string): Promise<number> {
  const rows = await db.query(sql, sql.includes('?') ? [emails] : [])
  return Number(rows[0]?.['n'])
}

beforeAll(async () => {
  db = await openTestDatabase()
})

afterAll(async () => {
  await db.query('DELETE FROM members WHERE email IN (?)', [emails])
  await db.close()
})

describe('the dev seed', () => {
  it('can be run twice without duplicating anything (R-SEED-7)', async () => {
    await applySeed(db.drizzle, plan, config.consentVersion)
    await applySeed(db.drizzle, plan, config.consentVersion)

    expect(
      await count('SELECT COUNT(*) AS n FROM members WHERE email IN (?)'),
    ).toBe(plan.members.length)
    expect(
      await count(
        'SELECT COUNT(*) AS n FROM member_roles mr ' +
          'JOIN members m ON m.id = mr.member_id WHERE m.email IN (?)',
      ),
    ).toBe(plan.members.length + 1)
  })

  it('makes the dev admin an active, onboarded admin (R-DEV-6)', async () => {
    const rows = await db.query(
      'SELECT m.status, m.name, m.consent_at, ' +
        "string_agg(mr.role_key, ',' ORDER BY mr.role_key) AS roles " +
        'FROM members m JOIN member_roles mr ON mr.member_id = m.id ' +
        'WHERE m.email = ? GROUP BY m.id, m.status, m.name, m.consent_at',
      [DEV_ADMIN_EMAIL],
    )

    expect(rows[0]).toMatchObject({ status: 'active', roles: 'admin,member' })
    expect(rows[0]?.['consent_at']).not.toBeNull()
  })

  it('seeds trends, cases, challenges and offers once, however often it runs (R-SEED-7)', async () => {
    await applySeed(db.drizzle, plan, config.consentVersion)

    expect(await count('SELECT COUNT(*) AS n FROM trends')).toBe(8)
    expect(await count('SELECT COUNT(*) AS n FROM cases')).toBe(
      plan.cases.length,
    )
    expect(
      await count(
        'SELECT COUNT(*) AS n FROM challenges c ' +
          'JOIN members m ON m.id = c.member_id WHERE m.email IN (?)',
      ),
    ).toBe(plan.challenges.length)
    expect(
      await count(
        'SELECT COUNT(*) AS n FROM member_expertise e ' +
          'JOIN members m ON m.id = e.member_id WHERE m.email IN (?)',
      ),
    ).toBe(plan.expertise.length)
  })
})

describe('the first admins of the prod seed (R-SEED-9)', () => {
  const admin = 'first-admin@seed.invalid'
  const prod = planSeed({
    seedProfile: 'prod',
    seedAdmins: [admin],
    env: 'production',
    mail: { delivery: 'smtp' },
  })

  async function adminRow(): Promise<Record<string, unknown> | undefined> {
    const rows = await db.query(
      'SELECT m.status, m.name, m.consent_at, ' +
        "string_agg(mr.role_key, ',' ORDER BY mr.role_key) AS roles " +
        'FROM members m LEFT JOIN member_roles mr ON mr.member_id = m.id ' +
        'WHERE m.email = ? GROUP BY m.id, m.status, m.name, m.consent_at',
      [admin],
    )
    return rows[0]
  }

  afterAll(async () => {
    await db.query('DELETE FROM members WHERE email = ?', [admin])
  })

  it('makes a new address an active admin who still has to onboard', async () => {
    await applySeed(db.drizzle, prod, config.consentVersion)

    expect(await adminRow()).toMatchObject({
      status: 'active',
      name: null,
      consent_at: null,
      roles: 'admin,member',
    })
  })

  it('gives back no role a host took away on a re-run', async () => {
    await db.query(
      "DELETE FROM member_roles WHERE role_key = 'admin' AND member_id = " +
        '(SELECT id FROM members WHERE email = ?)',
      [admin],
    )

    await applySeed(db.drizzle, prod, config.consentVersion)

    expect(await adminRow()).toMatchObject({ roles: 'member' })
  })
})
