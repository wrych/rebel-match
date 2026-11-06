import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { composeApp } from '../../src/compose.js'
import type { TestDatabase } from './support/database.js'
import {
  cookieFor,
  idOf,
  openSeededDatabase,
  testConfig,
} from './support/app.js'

const config = testConfig({
  SEED_PROFILE: 'dev',
  CONNECT_CODES: '1',
  LIVE_CODE_SECONDS: '30',
  LIVE_CODE_GRACE_SECONDS: '10',
})
const people = {
  tobias: 'tobias.renner@example.invalid',
  ana: 'ana.ferreira@example.invalid',
  priya: 'priya.raman@example.invalid',
}

let db: TestDatabase
let app: ReturnType<typeof createApp>
let deps: ReturnType<typeof composeApp>
const ids: Record<string, string> = {}
const cookies: Record<string, string> = {}

async function clear(): Promise<void> {
  const members = Object.values(ids)
  await db.query('DELETE FROM live_codes WHERE member_id IN (?)', [members])
  await db.query(
    'DELETE FROM notifications WHERE recipient_id IN (?) OR about_member_id IN (?)',
    [members, members],
  )
  await db.query(
    'DELETE FROM connection_requests WHERE requester_id IN (?) OR target_id IN (?)',
    [members, members],
  )
  await db.query("UPDATE members SET status = 'active' WHERE id IN (?)", [
    members,
  ])
}

beforeAll(async () => {
  db = await openSeededDatabase(config)
  deps = composeApp(config, db.drizzle)
  app = createApp(deps)
  for (const [who, email] of Object.entries(people)) {
    ids[who] = await idOf(db, email)
    cookies[who] = await cookieFor(deps.auth, ids[who])
  }
})

beforeEach(clear)

afterAll(async () => {
  await clear()
  await db.close()
})

interface Issued {
  token: string
  showForSeconds: number
  usableUntil: string
  connected: { name: string }[]
}

async function issue(who: string): Promise<Issued> {
  const response = await request(app)
    .post('/api/me/live-codes')
    .set('Cookie', cookies[who] ?? '')
  expect(response.status).toBe(201)
  return response.body as Issued
}

const scan = (who: string, token: string): request.Test =>
  request(app)
    .post('/api/live-codes/redeem')
    .set('Cookie', cookies[who] ?? '')
    .send({ token })

async function requestsBetween(a: string, b: string): Promise<unknown[]> {
  return db.query(
    'SELECT kind, status, requester_id FROM connection_requests WHERE (requester_id = ? AND target_id = ?) OR (requester_id = ? AND target_id = ?) ORDER BY created_at',
    [ids[a], ids[b], ids[b], ids[a]],
  )
}

describe('live codes on Postgres (R-CODE-5..7, F26)', () => {
  it('stores only a hash, and connects the scanner at once, telling the owner', async () => {
    const code = await issue('ana')
    const scanned = await scan('tobias', code.token)

    const stored = await db.query(
      'SELECT token_hash FROM live_codes WHERE member_id = ?',
      [ids['ana']],
    )
    expect(stored.map((row) => row['token_hash'])).not.toContain(code.token)
    expect(code.showForSeconds).toBe(30)
    expect(scanned.status).toBe(200)
    expect(await requestsBetween('tobias', 'ana')).toEqual([
      { kind: 'direct', status: 'accepted', requester_id: ids['tobias'] },
    ])
    const told = await db.query(
      'SELECT type FROM notifications WHERE recipient_id = ? AND about_member_id = ?',
      [ids['ana'], ids['tobias']],
    )
    expect(told).toEqual([{ type: 'new_connection' }])
  })

  it('reports who connected on the owner’s next code, once', async () => {
    const first = await issue('ana')
    await scan('tobias', first.token)

    const next = await issue('ana')
    const after = await issue('ana')

    expect(next.connected).toHaveLength(1)
    expect(after.connected).toEqual([])
  })

  it('lets a code be spent once, the same 410 for every code that cannot be used', async () => {
    const code = await issue('ana')
    await scan('tobias', code.token)

    expect((await scan('priya', code.token)).status).toBe(410)
    expect((await scan('priya', 'never-issued')).status).toBe(410)
    const own = await issue('priya')
    expect((await scan('priya', own.token)).status).toBe(410)
  })

  it('keeps the code before the newest usable for the grace, then no longer', async () => {
    const older = await issue('ana')
    await issue('ana')

    const [row] = await db.query(
      "SELECT usable_until <= now() + interval '10 seconds' AS cut FROM live_codes WHERE member_id = ? AND spent_at IS NULL ORDER BY created_at LIMIT 1",
      [ids['ana']],
    )
    expect(row?.['cut']).toBe(true)
    await db.query(
      "UPDATE live_codes SET usable_until = now() - interval '1 second' WHERE member_id = ?",
      [ids['ana']],
    )
    expect((await scan('tobias', older.token)).status).toBe(410)
  })

  it('stops a banned owner’s code at once (R-CODE-10)', async () => {
    const code = await issue('ana')
    await db.query("UPDATE members SET status = 'banned' WHERE id = ?", [
      ids['ana'],
    ])

    expect((await scan('tobias', code.token)).status).toBe(410)
  })

  it('accepts the owner’s pending request instead of adding one, telling them it was accepted', async () => {
    await db.query(
      "INSERT INTO connection_requests (id, requester_id, target_id, kind, status) VALUES ('lc-pending', ?, ?, 'direct', 'pending')",
      [ids['ana'], ids['tobias']],
    )
    const code = await issue('ana')
    const scanned = await scan('tobias', code.token)

    expect(scanned.body).toEqual({ id: 'lc-pending' })
    const told = await db.query(
      'SELECT type, connection_id FROM notifications WHERE recipient_id = ?',
      [ids['ana']],
    )
    expect(told).toEqual([
      { type: 'new_connection', connection_id: 'lc-pending' },
    ])
    const listed = await request(app)
      .get('/api/notifications')
      .set('Cookie', cookies['ana'] ?? '')
    expect(JSON.stringify(listed.body)).toContain('connection_accepted')
    expect(await requestsBetween('tobias', 'ana')).toEqual([
      { kind: 'direct', status: 'accepted', requester_id: ids['ana'] },
    ])
  })

  it('adds nothing between members already connected directly (R-CONN-8)', async () => {
    const first = await scan('tobias', (await issue('ana')).token)
    const again = await scan('tobias', (await issue('ana')).token)

    expect(again.body).toEqual(first.body)
    expect(await requestsBetween('tobias', 'ana')).toHaveLength(1)
  })

  it('connects once when two members scan each other’s codes at once', async () => {
    const [ana, tobias] = await Promise.all([issue('ana'), issue('tobias')])

    const scans = await Promise.all([
      scan('tobias', ana.token),
      scan('ana', tobias.token),
    ])

    expect(scans.map((each) => each.status)).toEqual([200, 200])
    expect(await requestsBetween('tobias', 'ana')).toHaveLength(1)
  })

  it('cleans up expired, reported and long-kept codes on the tick', async () => {
    await issue('ana')
    await db.query(
      "UPDATE live_codes SET usable_until = now() - interval '1 second' WHERE member_id = ?",
      [ids['ana']],
    )
    const live = await issue('ana')

    expect(await deps.liveCodes.purge()).toBe(1)
    await scan('tobias', live.token)
    await issue('ana')
    expect(await deps.liveCodes.purge()).toBe(1)
  })
})
