import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../../src/config.js'
import { configPolicy } from '../../src/permissions.js'
import { planSeed } from '../../src/seed/plan.js'
import { applySeed } from '../../src/seed/run.js'
import { createErasureStore } from '../../src/services/erasure-store.js'
import {
  createErasureService,
  type ErasureService,
} from '../../src/services/erasure.js'
import {
  openTestDatabase,
  testDatabaseUrl,
  type TestDatabase,
} from './support/database.js'

const config = loadConfig({
  DATABASE_URL: testDatabaseUrl,
  SESSION_SECRET: 'integration-session-secret-of-32-chars',
  NODE_ENV: 'test',
})

interface Person {
  id: string
  email: string
}

const person = (): Person => ({
  id: randomUUID(),
  email: `${randomUUID()}@example.invalid`,
})

let db: TestDatabase
let erasure: ErasureService
const guard = `erasure-${randomUUID().slice(0, 8)}`
const created: string[] = []

async function addMember(member: Person): Promise<void> {
  created.push(member.id)
  await db.query(
    "INSERT INTO members (id, email, status, analytics_id) VALUES (?, ?, 'active', ?)",
    [member.id, member.email, randomUUID()],
  )
}

async function count(text: string, params: unknown[]): Promise<number> {
  const [row] = await db.query(`SELECT count(*) AS n FROM ${text}`, params)
  return Number(row?.['n'])
}

/** Every row that holds something of this member, by table. */
async function traces(member: Person): Promise<Record<string, number>> {
  return {
    members: await count('members WHERE id = ?', [member.id]),
    member_roles: await count('member_roles WHERE member_id = ?', [member.id]),
    magic_tokens: await count('magic_tokens WHERE member_id = ?', [member.id]),
    challenges: await count('challenges WHERE member_id = ?', [member.id]),
    member_expertise: await count('member_expertise WHERE member_id = ?', [
      member.id,
    ]),
    follows: await count('follows WHERE member_id = ?', [member.id]),
    swipes: await count('swipes WHERE member_id = ?', [member.id]),
    connection_requests: await count(
      'connection_requests WHERE requester_id = ? OR target_id = ?',
      [member.id, member.id],
    ),
    outbox: await count('outbox WHERE member_id = ? OR to_email = ?', [
      member.id,
      member.email,
    ]),
    sessions: await count("sessions WHERE (data::jsonb ->> 'memberId') = ?", [
      member.id,
    ]),
  }
}

/** Gives the member a row in every table erasure must reach, with a peer on
 * the other side where a row joins two members. */
async function fillIn(member: Person, peer: Person): Promise<string> {
  const own = randomUUID()
  const peers = randomUUID()
  await db.query(
    "INSERT INTO member_roles (member_id, role_key) VALUES (?, 'member')",
    [member.id],
  )
  await db.query(
    'INSERT INTO magic_tokens (id, member_id, token_hash, expires_at) ' +
      "VALUES (?, ?, ?, now() + interval '1 hour')",
    [randomUUID(), member.id, randomUUID().replaceAll('-', '').repeat(2)],
  )
  await db.query(
    "INSERT INTO challenges (id, member_id, body, trend_id) VALUES (?, ?, 'mine', '01'), (?, ?, 'theirs', '01')",
    [own, member.id, peers, peer.id],
  )
  await db.query(
    "INSERT INTO member_expertise (member_id, trend_id) VALUES (?, '02')",
    [member.id],
  )
  await db.query("INSERT INTO follows (member_id, trend_id) VALUES (?, '03')", [
    member.id,
  ])
  await db.query(
    "INSERT INTO swipes (member_id, challenge_id, action) VALUES (?, ?, 'same_boat'), (?, ?, 'been_there')",
    [member.id, peers, peer.id, own],
  )
  await db.query(
    'INSERT INTO connection_requests (id, requester_id, target_id, challenge_id, kind) ' +
      "VALUES (?, ?, ?, ?, 'same_boat'), (?, ?, ?, ?, 'been_there')",
    [
      randomUUID(),
      member.id,
      peer.id,
      peers,
      randomUUID(),
      peer.id,
      member.id,
      own,
    ],
  )
  await db.query(
    'INSERT INTO outbox (id, member_id, to_email, kind, subject, body_text) ' +
      "VALUES (?, ?, ?, 'magic_link', 's', 'b'), (?, NULL, ?, 'admin_notice', 's', 'b')",
    [randomUUID(), member.id, member.email, randomUUID(), member.email],
  )
  await db.query(
    'INSERT INTO sessions (session_id, expires, data) VALUES (?, ?, ?)',
    [
      randomUUID(),
      Math.floor(Date.now() / 1000) + 3600,
      JSON.stringify({ memberId: member.id }),
    ],
  )
  return peers
}

beforeAll(async () => {
  db = await openTestDatabase()
  await applySeed(db.drizzle, { ...planSeed(config), members: [] }, '')
  await db.query(
    "INSERT INTO roles (role_key, label) VALUES (?, 'Erasure test guard')",
    [guard],
  )
  // The suite's own guarded role, so the last-holder rule is checked against
  // holders it knows, whatever other suites have in a shared database.
  erasure = createErasureService({
    store: createErasureStore(db.drizzle),
    policy: { ...configPolicy, rolesGranting: () => [guard] },
  })
})

beforeEach(async () => {
  await db.query('DELETE FROM member_roles WHERE role_key = ?', [guard])
})

afterAll(async () => {
  // Leave nothing behind: later suites on a shared database pick the oldest
  // challenges, and these members never finished onboarding.
  await db.query('DELETE FROM invites WHERE created_by IN (?)', [created])
  await db.query('DELETE FROM members WHERE id IN (?)', [created])
  await db.query('DELETE FROM member_roles WHERE role_key = ?', [guard])
  await db.query('DELETE FROM roles WHERE role_key = ?', [guard])
  await db.close()
})

describe('erasing a member over Postgres (R-NFR-7, R-MSG-6)', () => {
  it('removes every row of theirs and keeps the peer’s', async () => {
    const ana = person()
    const ben = person()
    await addMember(ana)
    await addMember(ben)
    const bensChallenge = await fillIn(ana, ben)
    const before = await traces(ana)
    expect(Object.entries(before).filter(([, n]) => n === 0)).toEqual([])

    expect(await erasure.erase(ana.id)).toBe('erased')

    expect(await traces(ana)).toEqual(
      Object.fromEntries(Object.keys(before).map((table) => [table, 0])),
    )
    expect(await count('challenges WHERE id = ?', [bensChallenge])).toBe(1)
    expect(await count('members WHERE id = ?', [ben.id])).toBe(1)
  })

  it('answers not_found for an unknown id', async () => {
    expect(await erasure.erase(randomUUID())).toBe('not_found')
  })

  it('refuses a member who created invites, and leaves them whole', async () => {
    const ana = person()
    await addMember(ana)
    await db.query(
      'INSERT INTO invites (id, token, label, valid_from, valid_until, max_uses, created_by) ' +
        "VALUES (?, ?, 'poster', now(), now() + interval '1 day', 10, ?)",
      [randomUUID(), randomUUID(), ana.id],
    )

    expect(await erasure.erase(ana.id)).toBe('created_invites')
    expect(await count('members WHERE id = ?', [ana.id])).toBe(1)
  })

  it('refuses the only admin, and erases one of two (R-ROLE-9)', async () => {
    const ana = person()
    const ben = person()
    await addMember(ana)
    await addMember(ben)
    await db.query(
      'INSERT INTO member_roles (member_id, role_key) VALUES (?, ?)',
      [ana.id, guard],
    )

    expect(await erasure.erase(ana.id)).toBe('last_admin')

    await db.query(
      'INSERT INTO member_roles (member_id, role_key) VALUES (?, ?)',
      [ben.id, guard],
    )
    expect(await erasure.erase(ana.id)).toBe('erased')
  })

  it('lets only one of the last two admins erasing each other succeed', async () => {
    const ana = person()
    const ben = person()
    await addMember(ana)
    await addMember(ben)
    await db.query(
      'INSERT INTO member_roles (member_id, role_key) VALUES (?, ?), (?, ?)',
      [ana.id, guard, ben.id, guard],
    )

    const outcomes = await Promise.all([
      erasure.erase(ana.id),
      erasure.erase(ben.id),
    ])

    expect(outcomes.sort()).toEqual(['erased', 'last_admin'])
  })
})
