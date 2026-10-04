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

// Each server holds its own live configuration, as two Cloud Run instances do.
function serverConfig(): ReturnType<typeof loadConfig> {
  return loadConfig({
    DATABASE_URL: testDatabaseUrl,
    SESSION_SECRET: 'integration-session-secret-of-32-chars',
    NODE_ENV: 'test',
  })
}

const host = { id: randomUUID(), email: `${randomUUID()}@example.invalid` }
const key = 'abuse.applicantsCeiling'

let db: TestDatabase
let config: ReturnType<typeof loadConfig>
let app: ReturnType<typeof createApp>
let cookie: string

beforeAll(async () => {
  db = await openTestDatabase()
  await db.query('DELETE FROM setting_overrides')
  await db.query(
    'INSERT INTO members (id, email, name, status, consent_version, ' +
      "consent_at, analytics_id) VALUES (?, ?, 'Hanna Host', 'active', ?, now(), ?)",
    [host.id, host.email, serverConfig().consentVersion, randomUUID()],
  )
  await db.query(
    "INSERT INTO roles (role_key, label) VALUES ('admin', 'Admin') ON CONFLICT DO NOTHING",
  )
  await db.query(
    "INSERT INTO member_roles (member_id, role_key) VALUES (?, 'admin')",
    [host.id],
  )
  config = serverConfig()
  const deps = composeApp(config, db.drizzle)
  app = createApp(deps)
  const session = await deps.auth.createSession(host.id)
  cookie = `${session.name}=${session.value}`
})

afterAll(async () => {
  await db.query('DELETE FROM setting_overrides')
  await db.query('DELETE FROM members WHERE id = ?', [host.id])
  await db.close()
})

describe('settings hosts change, over Postgres (R-CFG-6, ADR 0031)', () => {
  it('applies a change here at once, and on another server on refresh', async () => {
    const other = serverConfig()
    const otherDeps = composeApp(other, db.drizzle)

    const put = await request(app)
      .put(`/api/admin/settings/${key}`)
      .set('Cookie', cookie)
      .send({ value: 450 })

    expect(put.status).toBe(204)
    expect(config.abuse.applicantsCeiling).toBe(450)
    expect(other.abuse.applicantsCeiling).toBe(300)

    await otherDeps.settings.refresh()
    expect(other.abuse.applicantsCeiling).toBe(450)
  })

  it('goes back to the deployment value', async () => {
    const reset = await request(app)
      .delete(`/api/admin/settings/${key}`)
      .set('Cookie', cookie)

    expect(reset.status).toBe(204)
    expect(config.abuse.applicantsCeiling).toBe(300)
    expect(await db.query('SELECT key FROM setting_overrides')).toEqual([])
  })

  it('names the host who changed it, and forgets the name on erasure', async () => {
    await request(app)
      .put(`/api/admin/settings/${key}`)
      .set('Cookie', cookie)
      .send({ value: 450 })
    const deps = composeApp(serverConfig(), db.drizzle)
    await deps.settings.refresh()
    expect(deps.settings.overrides().get(key)?.changedByName).toBe('Hanna Host')

    await db.query('DELETE FROM members WHERE id = ?', [host.id])
    await deps.settings.refresh()

    expect(deps.settings.overrides().get(key)).toMatchObject({
      value: 450,
      changedBy: null,
      changedByName: null,
    })
  })
})
