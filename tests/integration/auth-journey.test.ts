import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import type { AuthProvider } from '../../src/auth/index.js'
import { composeApp, composeAuth, composeMailer } from '../../src/compose.js'
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
  NODE_ENV: 'development',
  MAIL_DELIVERY: 'none',
})

let db: TestDatabase
let auth: AuthProvider

async function linkFromOutbox(): Promise<string> {
  const rows = await db.query(
    'SELECT body_text FROM outbox WHERE to_email = ? ' +
      'ORDER BY created_at DESC LIMIT 1',
    [DEV_ADMIN_EMAIL],
  )
  const match = /https?:\/\/\S+/.exec(String(rows[0]?.['body_text']))
  return match![0]
}

beforeAll(async () => {
  db = await openTestDatabase()
  await applySeed(db.drizzle, planSeed(config), config.consentVersion)
  auth = composeAuth(config, db.drizzle, composeMailer(config, db.drizzle))
})

afterAll(async () => {
  await db.query('DELETE FROM outbox WHERE to_email = ?', [DEV_ADMIN_EMAIL])
  await db.close()
})

describe('signing in as the dev admin, end to end (R-QA-2)', () => {
  it('goes from a logged link to an admin session', async () => {
    const app = createApp({ ...composeApp(config, db.drizzle), auth })
    await auth.issueLink(DEV_ADMIN_EMAIL, {
      kind: 'self_service',
      next: '/admin/outbox',
    })

    const link = new URL(await linkFromOutbox())
    expect(link.pathname).toBe('/sign-in')

    // Opening the link uses nothing; the sign-in screen's button does.
    const verify = await request(app)
      .post('/auth/verify')
      .send({ token: link.hash.replace(/^#token=/, '') })
    const cookie = (verify.headers['set-cookie'] as unknown as string[])[0]!
    const me = await request(app)
      .get('/auth/me')
      .set('Cookie', cookie.split(';')[0]!)

    expect(verify.body).toEqual({ next: '/admin/outbox' })
    expect(me.body).toMatchObject({
      name: 'Dev Admin',
      onboarded: true,
      roles: expect.arrayContaining(['admin', 'member']) as string[],
      permissions: expect.arrayContaining(['outbox:read']) as string[],
    })
  })
})
