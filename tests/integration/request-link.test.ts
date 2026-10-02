import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { RowDataPacket } from 'mysql2/promise'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { composeAuth, composeMailer } from '../../src/compose.js'
import { loadConfig } from '../../src/config.js'
import { createPool, type Pool } from '../../src/db.js'
import { migrate } from '../../src/migrations/run.js'
import { configPolicy } from '../../src/permissions.js'
import { DEV_ADMIN_EMAIL } from '../../src/seed/dev/people.js'
import { planSeed } from '../../src/seed/plan.js'
import { applySeed } from '../../src/seed/run.js'
import {
  createMysqlAdmissionStore,
  createMysqlReviewerDirectory,
} from '../../src/services/admission-store.js'
import { createAdmission } from '../../src/services/admission.js'
import { createApplicantNotice } from '../../src/services/applicant-notice.js'
import { createMysqlMemberProfiles } from '../../src/services/member-profiles.js'
import { createMysqlOutboxLog } from '../../src/services/outbox-log-store.js'
import { createMysqlRoleGrantStore } from '../../src/services/role-grant-store.js'
import { createRoleService } from '../../src/services/roles.js'

const databaseUrl = process.env['DATABASE_URL']

if (databaseUrl === undefined) {
  throw new Error('integration tests need DATABASE_URL')
}

const config = loadConfig({
  DATABASE_URL: databaseUrl,
  SESSION_SECRET: 'integration-session-secret-of-32-chars',
  NODE_ENV: 'development',
  MAIL_DELIVERY: 'none',
})
const stranger = `${randomUUID()}@example.invalid`
const member = 'sanne.kuipers@example.invalid'

let pool: Pool
let app: ReturnType<typeof createApp>

async function outboxFor(to: string, kind: string): Promise<RowDataPacket[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM outbox WHERE to_email = ? AND kind = ?',
    [to, kind],
  )
  return rows
}

beforeAll(async () => {
  await migrate(databaseUrl, 'migrations')
  pool = createPool(config)
  await applySeed(pool, planSeed(config), config.consentVersion)
  await pool.query(
    "UPDATE members SET status = 'active' WHERE email IN (?, ?)",
    [DEV_ADMIN_EMAIL, member],
  )
  await pool.query("DELETE FROM outbox WHERE kind = 'admin_notice'")
  const mailer = composeMailer(config, pool)
  const auth = composeAuth(config, pool, mailer)
  app = createApp({
    config,
    pool,
    auth,
    profiles: createMysqlMemberProfiles(pool),
    roles: createRoleService({
      store: createMysqlRoleGrantStore(pool),
      policy: configPolicy,
    }),
    outbox: createMysqlOutboxLog(pool),
    admission: createAdmission({
      store: createMysqlAdmissionStore(pool),
      auth,
      notifyReviewers: createApplicantNotice({
        mailer,
        reviewers: createMysqlReviewerDirectory(pool),
        reviewerRoles: configPolicy.rolesGranting('applicant:review'),
        publicUrl: config.publicUrl,
      }),
    }),
  })
})

afterAll(async () => {
  await pool.query("DELETE FROM outbox WHERE kind = 'admin_notice'")
  await pool.query('DELETE FROM members WHERE email = ?', [stranger])
  await pool.end()
})

describe('POST /auth/request-link over MySQL', () => {
  it('emails a whitelisted member a link (R-AUTH-4)', async () => {
    const response = await request(app)
      .post('/auth/request-link')
      .send({ email: member })

    expect(response.body).toEqual({ state: 'check-email' })
    expect((await outboxFor(member, 'magic_link')).length).toBeGreaterThan(0)
  })

  it('records a stranger as an applicant and tells the reviewers (R-AUTH-2)', async () => {
    const response = await request(app)
      .post('/auth/request-link')
      .send({ email: stranger })

    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT status FROM members WHERE email = ?',
      [stranger],
    )
    const notices = await outboxFor(DEV_ADMIN_EMAIL, 'admin_notice')

    expect(response.body).toEqual({ state: 'access-requested' })
    expect(rows[0]?.['status']).toBe('applicant')
    expect(notices).toHaveLength(1)
    expect(String(notices[0]?.['body_text'])).toContain(stranger)
    expect(await outboxFor(stranger, 'magic_link')).toHaveLength(0)
  })

  it('does not repeat the notice when the applicant asks again (F4)', async () => {
    const response = await request(app)
      .post('/auth/request-link')
      .send({ email: stranger })

    expect(response.body).toEqual({ state: 'access-requested' })
    expect(await outboxFor(DEV_ADMIN_EMAIL, 'admin_notice')).toHaveLength(1)
  })
})
