import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { RowDataPacket } from 'mysql2/promise'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import type { AuthProvider } from '../../src/auth/index.js'
import { composeAuth } from '../../src/compose.js'
import { loadConfig } from '../../src/config.js'
import { createPool, type Pool } from '../../src/db.js'
import { migrate } from '../../src/migrations/run.js'
import { DEV_ADMIN_EMAIL } from '../../src/seed/dev/people.js'
import { planSeed } from '../../src/seed/plan.js'
import { applySeed } from '../../src/seed/run.js'
import { configPolicy } from '../../src/permissions.js'
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

let pool: Pool
let auth: AuthProvider

async function linkFromOutbox(): Promise<string> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT body_text FROM outbox WHERE to_email = ? ' +
      'ORDER BY created_at DESC LIMIT 1',
    [DEV_ADMIN_EMAIL],
  )
  const match = /https?:\/\/\S+/.exec(String(rows[0]?.['body_text']))
  const url = new URL(match![0])
  return `${url.pathname}${url.search}`
}

beforeAll(async () => {
  await migrate(databaseUrl, 'migrations')
  pool = createPool(config)
  await applySeed(pool, planSeed(config), config.consentVersion)
  auth = composeAuth(config, pool)
})

afterAll(async () => {
  await pool.query('DELETE FROM outbox WHERE to_email = ?', [DEV_ADMIN_EMAIL])
  await pool.end()
})

describe('signing in as the dev admin, end to end (R-QA-2)', () => {
  it('goes from a logged link to an admin session', async () => {
    const app = createApp({
      config,
      pool,
      auth,
      profiles: createMysqlMemberProfiles(pool),
      roles: createRoleService({
        store: createMysqlRoleGrantStore(pool),
        policy: configPolicy,
      }),
      outbox: createMysqlOutboxLog(pool),
    })
    await auth.issueLink(DEV_ADMIN_EMAIL, {
      kind: 'self_service',
      next: '/admin/outbox',
    })

    const verify = await request(app).get(await linkFromOutbox())
    const cookie = (verify.headers['set-cookie'] as unknown as string[])[0]!
    const me = await request(app)
      .get('/auth/me')
      .set('Cookie', cookie.split(';')[0]!)

    expect(verify.headers['location']).toBe('/admin/outbox')
    expect(me.body).toMatchObject({
      name: 'Dev Admin',
      onboarded: true,
      roles: expect.arrayContaining(['admin', 'member']) as string[],
      permissions: expect.arrayContaining(['outbox:read']) as string[],
    })
  })
})
