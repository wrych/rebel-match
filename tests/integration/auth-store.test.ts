import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { RowDataPacket } from 'mysql2/promise'
import {
  createAuth,
  createMysqlAuthStore,
  type AuthProvider,
  type OutgoingLink,
  type SessionCookie,
} from '../../src/auth/index.js'
import { loadConfig } from '../../src/config.js'
import { createPool, type Pool } from '../../src/db.js'
import { migrate } from '../../src/migrations/run.js'

const databaseUrl = process.env['DATABASE_URL']

if (databaseUrl === undefined) {
  throw new Error('integration tests need DATABASE_URL')
}

const config = loadConfig({
  DATABASE_URL: databaseUrl,
  SESSION_SECRET: 'integration-session-secret-of-32-chars',
})

const active = { id: randomUUID(), email: `${randomUUID()}@example.invalid` }
const rejected = { id: randomUUID(), email: `${randomUUID()}@example.invalid` }

let pool: Pool
let auth: AuthProvider
const sent: OutgoingLink[] = []

async function insertMember(
  member: { id: string; email: string },
  status: string,
  roles: string[],
): Promise<void> {
  await pool.query(
    'INSERT INTO members (id, email, status, analytics_id) VALUES (?, ?, ?, ?)',
    [member.id, member.email, status, randomUUID()],
  )
  for (const role of roles) {
    await pool.query(
      'INSERT INTO member_roles (member_id, role_key) VALUES (?, ?)',
      [member.id, role],
    )
  }
}

function asRequest(cookie: SessionCookie): { headers: { cookie: string } } {
  return { headers: { cookie: `${cookie.name}=${cookie.value}` } }
}

async function issueAndTake(): Promise<string> {
  await auth.issueLink(active.email, { kind: 'self_service', next: '/ask' })
  return new URL(sent.at(-1)!.url).searchParams.get('token')!
}

beforeAll(async () => {
  await migrate(databaseUrl, 'migrations')
  pool = createPool(config)
  await pool.query(
    "INSERT IGNORE INTO roles (role_key, label) VALUES ('member', 'Member')",
  )
  await insertMember(active, 'active', ['member'])
  await insertMember(rejected, 'rejected', ['member'])
  auth = createAuth({
    store: createMysqlAuthStore(pool),
    config,
    deliver: (link) => {
      sent.push(link)
      return Promise.resolve()
    },
  })
})

afterAll(async () => {
  await pool.query('DELETE FROM sessions')
  await pool.query('DELETE FROM members WHERE id IN (?, ?)', [
    active.id,
    rejected.id,
  ])
  await pool.end()
})

describe('the auth seam over MySQL', () => {
  it('signs a member in with a link exactly once (R-AUTH-5)', async () => {
    const raw = await issueAndTake()

    expect(await auth.verifyToken(raw)).toEqual({
      ok: true,
      memberId: active.id,
      next: '/ask',
    })
    expect(await auth.verifyToken(raw)).toEqual({ ok: false, reason: 'used' })
  })

  it('keeps only the token hash in magic_tokens (R-NFR-5)', async () => {
    const raw = await issueAndTake()

    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM magic_tokens WHERE member_id = ?',
      [active.id],
    )

    expect(rows.length).toBeGreaterThan(0)
    expect(JSON.stringify(rows)).not.toContain(raw)
  })

  it('refuses an expired link', async () => {
    const raw = await issueAndTake()
    await pool.query(
      'UPDATE magic_tokens SET expires_at = UTC_TIMESTAMP() - INTERVAL 1 SECOND ' +
        'WHERE member_id = ?',
      [active.id],
    )

    expect(await auth.verifyToken(raw)).toEqual({
      ok: false,
      reason: 'expired',
    })
  })

  it('keeps a session across requests until logout (R-AUTH-7)', async () => {
    const cookie = await auth.createSession(active.id)

    expect(await auth.currentMember(asRequest(cookie))).toEqual({
      id: active.id,
      roles: ['member'],
      permissions: ['challenge:create', 'connect', 'swipe'],
    })

    await auth.endSession(asRequest(cookie))

    expect(await auth.currentMember(asRequest(cookie))).toBeNull()
  })

  it('slides an idle session forward when it is used (R-AUTH-7)', async () => {
    const cookie = await auth.createSession(active.id)
    await pool.query(
      'UPDATE sessions SET expires = UNIX_TIMESTAMP() + 3600 ' +
        'WHERE JSON_EXTRACT(data, "$.memberId") = ?',
      [active.id],
    )

    expect(await auth.renewSession(asRequest(cookie))).not.toBeNull()

    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT expires - UNIX_TIMESTAMP() AS remaining FROM sessions ' +
        'WHERE JSON_EXTRACT(data, "$.memberId") = ?',
      [active.id],
    )
    expect(Number(rows[0]!['remaining'])).toBeGreaterThan(29 * 86_400)
  })

  it('does not resolve a member who is not active', async () => {
    const cookie = await auth.createSession(rejected.id)

    expect(await auth.currentMember(asRequest(cookie))).toBeNull()
  })
})
