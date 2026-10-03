import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { RowDataPacket } from 'mysql2/promise'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { composeApp } from '../../src/compose.js'
import { loadConfig } from '../../src/config.js'
import { createPool, type Pool } from '../../src/db.js'
import { migrate } from '../../src/migrations/run.js'
import { DEV_ADMIN_EMAIL } from '../../src/seed/dev/people.js'
import { planSeed } from '../../src/seed/plan.js'
import { applySeed } from '../../src/seed/run.js'
import type { InviteView } from '../../src/services/invites.js'

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
const label = `Integration ${String(Date.now())}`

let pool: Pool
let app: ReturnType<typeof createApp>
let cookie: string
let created: InviteView

beforeAll(async () => {
  await migrate(databaseUrl, 'migrations')
  pool = createPool(config)
  await applySeed(pool, planSeed(config), config.consentVersion)
  await pool.query("UPDATE members SET status = 'active' WHERE email = ?", [
    DEV_ADMIN_EMAIL,
  ])
  const deps = composeApp(config, pool)
  app = createApp(deps)
  const [admin] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM members WHERE email = ?',
    [DEV_ADMIN_EMAIL],
  )
  const session = await deps.auth.createSession(String(admin[0]?.['id']))
  cookie = `${session.name}=${session.value}`
})

afterAll(async () => {
  await pool.query('DELETE FROM invites WHERE label = ?', [label])
  await pool.end()
})

describe('invite links over MySQL (F16)', () => {
  it('creates an invite with defaults, recording its creator (R-INV-8,10)', async () => {
    const response = await request(app)
      .post('/api/admin/invites')
      .set('Cookie', cookie)
      .send({ label })

    created = (response.body as { invite: InviteView }).invite
    expect(response.status).toBe(201)
    expect(created).toMatchObject({
      label,
      maxUses: config.limits.inviteDefaultMaxUses,
      uses: 0,
      state: 'active',
      createdBy: DEV_ADMIN_EMAIL,
    })
    expect(created.joinUrl).toMatch(/\/\?invite=[A-Za-z0-9_-]{24}$/)
  })

  it('lists it with the same join URL, so the QR can be re-rendered (R-INV-9)', async () => {
    const response = await request(app)
      .get('/api/admin/invites')
      .set('Cookie', cookie)

    const listed = (response.body as { invites: InviteView[] }).invites.find(
      (invite) => invite.id === created.id,
    )
    expect(listed?.joinUrl).toBe(created.joinUrl)
  })

  it('revokes it on the spot (R-INV-3)', async () => {
    await request(app)
      .post(`/api/admin/invites/${created.id}/revoke`)
      .set('Cookie', cookie)
      .expect(204)

    const response = await request(app)
      .get('/api/admin/invites')
      .set('Cookie', cookie)
    const listed = (response.body as { invites: InviteView[] }).invites.find(
      (invite) => invite.id === created.id,
    )
    expect(listed?.state).toBe('revoked')
  })
})
