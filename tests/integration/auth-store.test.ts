import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createAuth,
  createAuthStore,
  type AuthProvider,
  type OutgoingLink,
  type SessionCookie,
} from '../../src/auth/index.js'
import { loadConfig } from '../../src/config.js'
import {
  openTestDatabase,
  testDatabaseUrl,
  type TestDatabase,
} from './support/database.js'
import { configPolicy } from '../../src/permissions.js'

const config = loadConfig({
  DATABASE_URL: testDatabaseUrl,
  SESSION_SECRET: 'integration-session-secret-of-32-chars',
})

const active = { id: randomUUID(), email: `${randomUUID()}@example.invalid` }
const rejected = { id: randomUUID(), email: `${randomUUID()}@example.invalid` }

let db: TestDatabase
let auth: AuthProvider
const sent: OutgoingLink[] = []

async function insertMember(
  member: { id: string; email: string },
  status: string,
  roles: string[],
): Promise<void> {
  await db.query(
    'INSERT INTO members (id, email, status, analytics_id) VALUES (?, ?, ?, ?)',
    [member.id, member.email, status, randomUUID()],
  )
  for (const role of roles) {
    await db.query(
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
  return new URL(sent.at(-1)!.url).hash.replace(/^#token=/, '')
}

beforeAll(async () => {
  db = await openTestDatabase()
  await db.query(
    "INSERT INTO roles (role_key, label) VALUES ('member', 'Member') ON CONFLICT DO NOTHING",
  )
  await insertMember(active, 'active', ['member'])
  await insertMember(rejected, 'rejected', ['member'])
  auth = createAuth({
    policy: configPolicy,
    store: createAuthStore(db.drizzle),
    config,
    deliver: (link) => {
      sent.push(link)
      return Promise.resolve()
    },
  })
})

afterAll(async () => {
  await db.query('DELETE FROM sessions')
  await db.query('DELETE FROM members WHERE id IN (?, ?)', [
    active.id,
    rejected.id,
  ])
  await db.close()
})

describe('the auth seam over Postgres', () => {
  it('signs a member in with a link exactly once (R-AUTH-5)', async () => {
    const raw = await issueAndTake()

    expect(await auth.verifyToken(raw)).toEqual({
      ok: true,
      memberId: active.id,
      next: '/ask',
      kind: 'self_service',
    })
    expect(await auth.verifyToken(raw)).toEqual({ ok: false, reason: 'used' })
  })

  it('keeps only the token hash in magic_tokens (R-NFR-5)', async () => {
    const raw = await issueAndTake()

    const rows = await db.query(
      'SELECT * FROM magic_tokens WHERE member_id = ?',
      [active.id],
    )

    expect(rows.length).toBeGreaterThan(0)
    expect(JSON.stringify(rows)).not.toContain(raw)
  })

  it('refuses an expired link', async () => {
    const raw = await issueAndTake()
    await db.query(
      "UPDATE magic_tokens SET expires_at = now() - interval '1 second' " +
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
      permissions: [
        'challenge:create',
        'challenge:swipe',
        'connection:request',
      ],
    })

    await auth.endSession(asRequest(cookie))

    expect(await auth.currentMember(asRequest(cookie))).toBeNull()
  })

  it('slides an idle session forward when it is used (R-AUTH-7)', async () => {
    const cookie = await auth.createSession(active.id)
    await db.query(
      'UPDATE sessions SET expires = extract(epoch FROM now())::bigint + 3600 ' +
        "WHERE data::jsonb ->> 'memberId' = ?",
      [active.id],
    )

    expect(await auth.renewSession(asRequest(cookie))).not.toBeNull()

    const rows = await db.query(
      'SELECT expires - extract(epoch FROM now())::bigint AS remaining ' +
        "FROM sessions WHERE data::jsonb ->> 'memberId' = ?",
      [active.id],
    )
    expect(Number(rows[0]!['remaining'])).toBeGreaterThan(29 * 86_400)
  })

  it('does not resolve a member who is not active', async () => {
    const cookie = await auth.createSession(rejected.id)

    expect(await auth.currentMember(asRequest(cookie))).toBeNull()
  })

  it('purges expired sessions and tokens, keeping live ones (ADR 0034)', async () => {
    const expireAll = async (): Promise<void> => {
      await db.query(
        'UPDATE sessions SET expires = extract(epoch FROM now())::bigint - 60 ' +
          "WHERE data::jsonb ->> 'memberId' = ?",
        [active.id],
      )
      await db.query(
        "UPDATE magic_tokens SET expires_at = now() - interval '1 minute' " +
          'WHERE member_id = ?',
        [active.id],
      )
    }
    const count = async (sql: string): Promise<number> =>
      Number((await db.query(sql, [active.id]))[0]!['n'])
    await auth.createSession(active.id)
    await issueAndTake()
    await expireAll()
    const live = await auth.createSession(active.id)
    const used = await issueAndTake()
    expect((await auth.verifyToken(used)).ok).toBe(true)
    const fresh = await issueAndTake()

    const purged = await auth.purgeExpired()

    expect(purged.sessions).toBeGreaterThanOrEqual(1)
    expect(purged.tokens).toBeGreaterThanOrEqual(2)
    expect(
      await count(
        "SELECT count(*) AS n FROM sessions WHERE data::jsonb ->> 'memberId' = ?",
      ),
    ).toBe(1)
    expect(
      await count('SELECT count(*) AS n FROM magic_tokens WHERE member_id = ?'),
    ).toBe(1)
    expect(await auth.currentMember(asRequest(live))).not.toBeNull()
    expect((await auth.verifyToken(fresh)).ok).toBe(true)
  })
})
