import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { RowDataPacket } from 'mysql2/promise'
import { loadConfig } from '../../src/config.js'
import { createPool, type Pool } from '../../src/db.js'
import { migrate } from '../../src/migrations/run.js'
import { DEV_ADMIN_EMAIL } from '../../src/seed/dev/people.js'
import { planSeed } from '../../src/seed/plan.js'
import { applySeed } from '../../src/seed/run.js'

const databaseUrl = process.env['DATABASE_URL']

if (databaseUrl === undefined) {
  throw new Error('integration tests need DATABASE_URL')
}

const config = loadConfig({
  DATABASE_URL: databaseUrl,
  SESSION_SECRET: 'integration-session-secret-of-32-chars',
  NODE_ENV: 'test',
  SEED_PROFILE: 'dev',
})
const plan = planSeed(config)
const emails = plan.members.map((member) => member.email)

let pool: Pool

async function count(sql: string): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(sql, [emails])
  return Number(rows[0]?.['n'])
}

beforeAll(async () => {
  await migrate(databaseUrl, 'migrations')
  pool = createPool(config)
})

afterAll(async () => {
  await pool.query('DELETE FROM members WHERE email IN (?)', [emails])
  await pool.end()
})

describe('the dev seed', () => {
  it('can be run twice without duplicating anything (R-SEED-7)', async () => {
    await applySeed(pool, plan, config.consentVersion)
    await applySeed(pool, plan, config.consentVersion)

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
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT m.status, m.name, m.consent_at, ' +
        'GROUP_CONCAT(mr.role_key ORDER BY mr.role_key) AS roles ' +
        'FROM members m JOIN member_roles mr ON mr.member_id = m.id ' +
        'WHERE m.email = ? GROUP BY m.id',
      [DEV_ADMIN_EMAIL],
    )

    expect(rows[0]).toMatchObject({ status: 'active', roles: 'admin,member' })
    expect(rows[0]?.['consent_at']).not.toBeNull()
  })
})
