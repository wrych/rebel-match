import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { composeApp } from '../../src/compose.js'
import { loadConfig } from '../../src/config.js'
import {
  openTestDatabase,
  testDatabaseUrl,
  type Row,
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
const hour = 3_600_000
const invite = { id: randomUUID(), token: `ok-${randomUUID()}` }
const revoked = { id: randomUUID(), token: `rv-${randomUUID()}` }
const scanner = `${randomUUID()}@example.invalid`
const second = `${randomUUID()}@example.invalid`
const late = `${randomUUID()}@example.invalid`

let db: TestDatabase
let app: ReturnType<typeof createApp>
let adminId: string

async function memberOf(email: string): Promise<Row | undefined> {
  const rows = await db.query(
    'SELECT id, status, joined_via_invite_id FROM members WHERE email = ?',
    [email],
  )
  return rows[0]
}

async function usesOf(id: string): Promise<number> {
  const rows = await db.query('SELECT uses FROM invites WHERE id = ?', [id])
  return Number(rows[0]?.['uses'])
}

beforeAll(async () => {
  db = await openTestDatabase()
  await applySeed(db.drizzle, planSeed(config), config.consentVersion)
  const admin = await db.query('SELECT id FROM members WHERE email = ?', [
    DEV_ADMIN_EMAIL,
  ])
  adminId = String(admin[0]?.['id'])
  const now = Date.now()
  for (const [row, maxUses, revokedAt] of [
    [invite, 2, null],
    [revoked, 10, new Date(now)],
  ] as const) {
    await db.query(
      'INSERT INTO invites (id, token, label, valid_from, valid_until, ' +
        'max_uses, revoked_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        row.id,
        row.token,
        'Integration',
        new Date(now - hour),
        new Date(now + hour),
        maxUses,
        revokedAt,
        adminId,
      ],
    )
  }
  app = createApp(composeApp(config, db.drizzle))
})

afterAll(async () => {
  await db.query('DELETE FROM members WHERE email IN (?, ?, ?)', [
    scanner,
    second,
    late,
  ])
  await db.query('DELETE FROM invites WHERE id IN (?, ?)', [
    invite.id,
    revoked.id,
  ])
  await db.query("DELETE FROM outbox WHERE kind = 'admin_notice'")
  await db.close()
})

function scan(email: string, token: string): request.Test {
  return request(app).post('/auth/request-link').send({ email, invite: token })
}

describe('joining through an invite over Postgres (F15)', () => {
  it('admits the scanner as an active member, sending a link (R-INV-1,7,8)', async () => {
    const response = await scan(scanner, invite.token)

    const member = await memberOf(scanner)
    const roles = await db.query(
      'SELECT role_key, granted_by FROM member_roles WHERE member_id = ?',
      [member?.['id']],
    )
    const links = await db.query(
      "SELECT 1 FROM outbox WHERE to_email = ? AND kind = 'magic_link'",
      [scanner],
    )
    expect(response.body).toEqual({ state: 'check-email' })
    expect(member).toMatchObject({
      status: 'active',
      joined_via_invite_id: invite.id,
    })
    expect(roles).toEqual([{ role_key: 'member', granted_by: adminId }])
    expect(links).toHaveLength(1)
    expect(await usesOf(invite.id)).toBe(1)
  })

  it('uses no seat when the scanner already has an account (F15)', async () => {
    await scan(scanner, invite.token).expect(200)

    expect(await usesOf(invite.id)).toBe(1)
  })

  it('queues a scanner once the cap is reached, with the notice (R-INV-4,5)', async () => {
    await scan(second, invite.token).expect(200)
    const response = await scan(late, invite.token)

    expect(await usesOf(invite.id)).toBe(2)
    expect(response.body).toMatchObject({
      state: 'access-requested',
      inviteRefused: true,
    })
    expect((await memberOf(late))?.['status']).toBe('applicant')
  })

  it('refuses a revoked invite on its next use (R-INV-3,5)', async () => {
    const email = `${randomUUID()}@example.invalid`
    try {
      const response = await scan(email, revoked.token)

      expect(response.body).toMatchObject({ inviteRefused: true })
      expect((await memberOf(email))?.['status']).toBe('applicant')
    } finally {
      await db.query('DELETE FROM members WHERE email = ?', [email])
    }
  })

  it('refuses an unknown token the same way', async () => {
    const email = `${randomUUID()}@example.invalid`
    try {
      const response = await scan(email, 'no-such-token')

      expect(response.body).toMatchObject({ inviteRefused: true })
    } finally {
      await db.query('DELETE FROM members WHERE email = ?', [email])
    }
  })
})
