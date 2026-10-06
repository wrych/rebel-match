import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp, type AppDeps } from '../../src/app.js'
import { composeApp } from '../../src/compose.js'
import { loadConfig } from '../../src/config.js'
import {
  openTestDatabase,
  testDatabaseUrl,
  type Row,
  type TestDatabase,
} from './support/database.js'
import { planSeed } from '../../src/seed/plan.js'
import { applySeed } from '../../src/seed/run.js'
import type { ConnectionView } from '../../src/services/connections.js'

const config = loadConfig({
  DATABASE_URL: testDatabaseUrl,
  SESSION_SECRET: 'integration-session-secret-of-32-chars',
  NODE_ENV: 'test',
  SEED_PROFILE: 'dev',
})
const people = {
  ada: 'marieke.de.wit@example.invalid',
  bob: 'sanne.kuipers@example.invalid',
  eve: 'ruben.vos@example.invalid',
  dee: 'jonas.brand@example.invalid',
}

let db: TestDatabase
let app: ReturnType<typeof createApp>
const ids: Record<string, string> = {}
const cookies: Record<string, string> = {}
let bobChallenge: string
let mail: AppDeps['notificationMail']

// What the outbound log holds once the worker has run, as the server's timer
// runs it (R-NOTE-7).
async function sent(query: string, params: unknown[]): Promise<Row[]> {
  await mail.deliverDue()
  return db.query(query, params)
}

beforeAll(async () => {
  db = await openTestDatabase()
  await applySeed(db.drizzle, planSeed(config), config.consentVersion)
  const deps = composeApp(config, db.drizzle)
  mail = deps.notificationMail
  app = createApp(deps)
  for (const [who, email] of Object.entries(people)) {
    const rows = await db.query('SELECT id FROM members WHERE email = ?', [
      email,
    ])
    ids[who] = String(rows[0]?.['id'])
    const session = await deps.auth.createSession(ids[who])
    cookies[who] = `${session.name}=${session.value}`
  }
  await db.query(
    'DELETE FROM connection_requests WHERE requester_id IN (?) OR target_id IN (?)',
    [Object.values(ids), Object.values(ids)],
  )
  await db.query(
    "DELETE FROM outbox WHERE kind IN ('connection_request', 'connection_accepted', 'connection_added') AND member_id IN (?)",
    [Object.values(ids)],
  )
  // These tests read each email as it goes; when it goes is the worker's
  // concern (tests/integration/notification-mail.test.ts).
  await db.query('DELETE FROM notification_settings WHERE member_id IN (?)', [
    Object.values(ids),
  ])
  for (const id of Object.values(ids))
    await db.query(
      "INSERT INTO notification_settings (member_id, type, cadence) VALUES (?, 'connection_request', 'immediately'), (?, 'new_connection', 'immediately')",
      [id, id],
    )
  const challenge = await db.query(
    'SELECT id FROM challenges WHERE member_id = ? LIMIT 1',
    [ids['bob']],
  )
  bobChallenge = String(challenge[0]?.['id'])
})

afterAll(async () => {
  await db.query('DELETE FROM notification_settings WHERE member_id IN (?)', [
    Object.values(ids),
  ])
  await db.query(
    'DELETE FROM connection_requests WHERE requester_id IN (?) OR target_id IN (?)',
    [Object.values(ids), Object.values(ids)],
  )
  await db.close()
})

function as(who: string): (r: request.Test) => request.Test {
  return (r) => r.set('Cookie', cookies[who]!)
}

async function newConnections(who: string): Promise<number> {
  const response = await as(who)(request(app).get('/api/cockpit')).expect(200)
  return (response.body as { newConnections: number }).newConnections
}

async function connect(
  from: string,
  to: string,
  kind = 'same_boat',
): Promise<request.Response> {
  return as(from)(request(app).post('/api/connections')).send({
    targetId: ids[to],
    challengeId: to === 'bob' ? bobChallenge : undefined,
    kind,
    message: 'We are living the same thing; would love to compare notes.',
  })
}

describe('connecting over Postgres: the double opt-in (F7, ADR 0004)', () => {
  let accepted: string
  let declined: string

  it('creates a pending request that reveals no email to anyone (R-CONN-1,2)', async () => {
    const created = await connect('ada', 'bob')
    accepted = (created.body as { id: string }).id

    const incoming = await as('bob')(
      request(app).get('/api/connections/incoming'),
    )
    const mine = (incoming.body as { requests: ConnectionView[] }).requests
    expect(created.status).toBe(201)
    expect(mine.map((r) => r.id)).toContain(accepted)
    expect(
      mine.find((r) => r.id === accepted)?.challenge?.body.length,
    ).toBeGreaterThan(0)
    expect(JSON.stringify(incoming.body)).not.toContain('@')
    for (const who of ['ada', 'bob']) {
      await as(who)(
        request(app).get(`/api/connections/${accepted}/contact`),
      ).expect(404)
    }
  })

  it('emails the target who asks, their note and a link, but no address or challenge (R-CONN-2, R-NAV-9)', async () => {
    const logged = await sent(
      "SELECT to_email, about_member_id, subject, body_text FROM outbox WHERE kind = 'connection_request' AND member_id = ?",
      [ids['bob']],
    )
    const [ada] = await db.query('SELECT name FROM members WHERE id = ?', [
      ids['ada'],
    ])
    const [challenge] = await db.query(
      'SELECT body FROM challenges WHERE id = ?',
      [bobChallenge],
    )

    expect(logged).toHaveLength(1)
    expect(logged[0]?.['to_email']).toBe(people.bob)
    expect(logged[0]?.['about_member_id']).toBe(ids['ada'])
    const mail = `${String(logged[0]?.['subject'])}\n${String(logged[0]?.['body_text'])}`
    expect(mail).toContain(`/matches/requests/${accepted}`)
    expect(mail).toContain(String(ada?.['name']))
    expect(mail).toContain('would love to compare notes')
    expect(mail).not.toContain(people.ada)
    expect(mail).not.toContain(String(challenge?.['body']))
  })

  it('surfaces the existing request rather than a second one (R-CONN-5)', async () => {
    const again = await connect('ada', 'bob', 'been_there')

    expect(again.status).toBe(409)
    expect(again.body).toEqual({ result: 'exists', id: accepted })
  })

  it('lets nobody but the target accept (R-CONN-3)', async () => {
    await as('ada')(
      request(app).post(`/api/connections/${accepted}/accept`),
    ).expect(404)
    await as('eve')(
      request(app).post(`/api/connections/${accepted}/accept`),
    ).expect(404)
    await as('bob')(
      request(app).post(`/api/connections/${accepted}/accept`),
    ).expect(204)
  })

  it('tells the requester by email and badge, with no address (R-CONN-7, R-NAV-9)', async () => {
    const logged = await sent(
      "SELECT to_email, about_member_id, subject, body_text FROM outbox WHERE kind = 'connection_accepted' AND member_id = ?",
      [ids['ada']],
    )
    const connected = await as('ada')(
      request(app).get('/api/connections/connected'),
    )

    expect(logged).toHaveLength(1)
    expect(logged[0]?.['to_email']).toBe(people.ada)
    expect(logged[0]?.['about_member_id']).toBe(ids['bob'])
    const mail = `${String(logged[0]?.['subject'])}\n${String(logged[0]?.['body_text'])}`
    expect(mail).toContain(`/matches/requests/${accepted}/contact`)
    expect(mail).not.toContain(people.bob)
    expect(await newConnections('ada')).toBe(1)
    expect(await newConnections('bob')).toBe(0)
    expect(
      (connected.body as { connections: ConnectionView[] }).connections.map(
        (c) => [c.id, c.unseen],
      ),
    ).toEqual([[accepted, true]])
  })

  it('gives each party the other’s email once accepted (R-CONN-3)', async () => {
    const forAda = await as('ada')(
      request(app).get(`/api/connections/${accepted}/contact`),
    )
    const forBob = await as('bob')(
      request(app).get(`/api/connections/${accepted}/contact`),
    )

    expect(forAda.body).toMatchObject({ contact: { email: people.bob } })
    expect(forBob.body).toMatchObject({ contact: { email: people.ada } })
  })

  it('ends the requester’s notice once they opened the contact (R-CONN-7)', async () => {
    expect(await newConnections('ada')).toBe(0)
  })

  it('lists the connection for both parties, without an email (R-MINE-5)', async () => {
    const listed = async (who: string): Promise<ConnectionView[]> =>
      (
        (
          await as(who)(request(app).get('/api/connections/connected')).expect(
            200,
          )
        ).body as { connections: ConnectionView[] }
      ).connections

    const forAda = await listed('ada')
    const forBob = await listed('bob')

    expect(forAda.map((c) => [c.id, c.direction, c.other.memberId])).toEqual([
      [accepted, 'outgoing', ids['bob']],
    ])
    expect(forBob.map((c) => [c.id, c.direction, c.other.memberId])).toEqual([
      [accepted, 'incoming', ids['ada']],
    ])
    expect(await listed('eve')).toEqual([])
    expect(JSON.stringify([forAda, forBob])).not.toContain('@')
  })

  it('never shows a third party the request or a contact (R-CONN-6)', async () => {
    await as('eve')(request(app).get(`/api/connections/${accepted}`)).expect(
      404,
    )
    await as('eve')(
      request(app).get(`/api/connections/${accepted}/contact`),
    ).expect(404)
  })

  it('keeps both emails private for good after a decline (R-CONN-4)', async () => {
    const created = await connect('dee', 'eve')
    declined = (created.body as { id: string }).id

    await as('eve')(
      request(app).post(`/api/connections/${declined}/decline`),
    ).expect(204)
    await as('eve')(
      request(app).post(`/api/connections/${declined}/accept`),
    ).expect(404)
    for (const who of ['dee', 'eve']) {
      await as(who)(
        request(app).get(`/api/connections/${declined}/contact`),
      ).expect(404)
    }
    expect(
      await sent(
        "SELECT id FROM outbox WHERE kind = 'connection_accepted' AND member_id = ?",
        [ids['dee']],
      ),
    ).toEqual([])
    expect(await newConnections('dee')).toBe(0)
  })

  it('lists no declined request as a connection (R-MINE-5)', async () => {
    const response = await as('eve')(
      request(app).get('/api/connections/connected'),
    )

    expect(
      (response.body as { connections: ConnectionView[] }).connections,
    ).toEqual([])
  })

  it('lets a declined request be followed by a new one (R-CONN-5)', async () => {
    const again = await connect('dee', 'eve')

    expect(again.status).toBe(201)
    expect((again.body as { id: string }).id).not.toBe(declined)
  })

  it('keeps one pending request when two arrive at once (R-CONN-5)', async () => {
    const [first, second] = await Promise.all([
      connect('ada', 'dee'),
      connect('ada', 'dee'),
    ])

    expect([first.status, second.status].sort()).toEqual([201, 409])
    const rows = await db.query(
      "SELECT COUNT(*) AS n FROM connection_requests WHERE requester_id = ? AND target_id = ? AND status = 'pending'",
      [ids['ada'], ids['dee']],
    )
    expect(Number(rows[0]?.['n'])).toBe(1)
  })

  it("refuses a request about a stranger's challenge", async () => {
    const response = await as('eve')(
      request(app).post('/api/connections'),
    ).send({
      targetId: ids['dee'],
      challengeId: bobChallenge,
      kind: 'same_boat',
    })

    expect(response.status).toBe(404)
  })
})

describe('connecting again once connected, over Postgres (R-CONN-8..10, ADR 0035)', () => {
  let first: string
  let added: string

  const between = async (): Promise<number> => {
    const rows = await db.query(
      'SELECT COUNT(*) AS n FROM connection_requests WHERE (requester_id = ? AND target_id = ?) OR (requester_id = ? AND target_id = ?)',
      [ids['ada'], ids['bob'], ids['bob'], ids['ada']],
    )
    return Number(rows[0]?.['n'])
  }

  it('accepts a further request at once, whichever side sends it (R-CONN-8)', async () => {
    const [row] = await db.query(
      "SELECT id FROM connection_requests WHERE requester_id = ? AND target_id = ? AND status = 'accepted'",
      [ids['ada'], ids['bob']],
    )
    first = String(row?.['id'])

    const response = await connect('bob', 'ada', 'been_there')
    added = (response.body as { id: string }).id

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ result: 'joined', id: added })
    const [stored] = await db.query(
      'SELECT status FROM connection_requests WHERE id = ?',
      [added],
    )
    expect(stored?.['status']).toBe('accepted')
  })

  it('tells the target by email and badge, with no address (R-CONN-9, R-NAV-9)', async () => {
    const logged = await sent(
      "SELECT to_email, about_member_id, subject, body_text FROM outbox WHERE kind = 'connection_added' AND member_id = ?",
      [ids['ada']],
    )

    expect(logged).toHaveLength(1)
    expect(logged[0]?.['to_email']).toBe(people.ada)
    expect(logged[0]?.['about_member_id']).toBe(ids['bob'])
    const mail = `${String(logged[0]?.['subject'])}\n${String(logged[0]?.['body_text'])}`
    expect(mail).toContain(`/matches/requests/${added}/contact`)
    expect(mail).toContain('would love to compare notes')
    expect(mail).not.toContain(people.bob)
    expect(await newConnections('ada')).toBe(1)
  })

  it('lists on the contact what the two are connected over, then ends the notice (R-CONN-10)', async () => {
    const response = await as('ada')(
      request(app).get(`/api/connections/${first}/contact`),
    ).expect(200)
    const over = (response.body as { contact: { over: ConnectionView[] } })
      .contact.over

    expect(over.map((each) => [each.id, each.direction, each.unseen])).toEqual([
      [added, 'incoming', true],
      [first, 'outgoing', false],
    ])
    expect(over[1]?.challenge?.body.length).toBeGreaterThan(0)
    expect(await newConnections('ada')).toBe(0)
  })

  it('adds nothing about a challenge they are already connected over (R-CONN-8)', async () => {
    const before = await between()

    const again = await connect('ada', 'bob')

    expect(again.status).toBe(200)
    expect(again.body).toEqual({ result: 'joined', id: first })
    expect(await between()).toBe(before)
  })
})

describe('accepting one of several requests between two, over Postgres (R-CONN-11)', () => {
  it('accepts every request pending between them, telling the requester once', async () => {
    const [waiting] = await db.query(
      "SELECT id FROM connection_requests WHERE requester_id = ? AND target_id = ? AND status = 'pending'",
      [ids['dee'], ids['eve']],
    )
    const fromDee = String(waiting?.['id'])
    const reverse = await connect('eve', 'dee', 'been_there')
    expect(reverse.status).toBe(201)
    const fromEve = (reverse.body as { id: string }).id

    await as('eve')(
      request(app).post(`/api/connections/${fromDee}/accept`),
    ).expect(204)

    const rows = await db.query(
      'SELECT id, status FROM connection_requests WHERE id IN (?)',
      [[fromDee, fromEve]],
    )
    expect(rows.map((row) => row['status'])).toEqual(['accepted', 'accepted'])
    expect(await newConnections('eve')).toBe(0)
    expect(await newConnections('dee')).toBe(2)
    const incoming = await as('dee')(
      request(app).get('/api/connections/incoming'),
    )
    expect(JSON.stringify(incoming.body)).not.toContain(fromEve)
    const told = await sent(
      "SELECT id FROM outbox WHERE kind = 'connection_accepted' AND member_id = ?",
      [ids['dee']],
    )
    expect(told).toHaveLength(1)
    const contact = await as('dee')(
      request(app).get(`/api/connections/${fromDee}/contact`),
    ).expect(200)
    expect(
      (contact.body as { contact: { over: ConnectionView[] } }).contact.over
        .map((each) => each.id)
        .sort(),
    ).toEqual([fromDee, fromEve].sort())
  })
})

describe('a member set to be deleted, over Postgres (ADR 0032)', () => {
  const insert = async (
    from: string,
    to: string,
    status: string,
  ): Promise<string> => {
    const rows = await db.query(
      'INSERT INTO connection_requests (id, requester_id, target_id, kind, status) ' +
        "VALUES (gen_random_uuid()::text, ?, ?, 'same_boat', ?) RETURNING id",
      [ids[from], ids[to], status],
    )
    return String(rows[0]?.['id'])
  }
  const setStatus = (who: string, status: string): Promise<unknown> =>
    db.query('UPDATE members SET status = ? WHERE id = ?', [status, ids[who]])
  const pendingFor = async (who: string): Promise<number> =>
    (
      (await as(who)(request(app).get('/api/cockpit'))).body as {
        pendingIncoming: number
      }
    ).pendingIncoming

  it('hides them from every connection view, their email above all', async () => {
    await db.query(
      'DELETE FROM connection_requests WHERE requester_id IN (?) OR target_id IN (?)',
      [[ids['dee']], [ids['dee']]],
    )
    const connected = await insert('eve', 'dee', 'accepted')
    const pending = await insert('dee', 'ada', 'pending')
    const before = await pendingFor('ada')

    await setStatus('dee', 'deleted')
    try {
      await as('eve')(
        request(app).get(`/api/connections/${connected}/contact`),
      ).expect(404)
      await as('eve')(request(app).get(`/api/connections/${connected}`)).expect(
        404,
      )
      const list = await as('eve')(
        request(app).get('/api/connections/connected'),
      )
      expect(JSON.stringify(list.body)).not.toContain(ids['dee'])
      const incoming = await as('ada')(
        request(app).get('/api/connections/incoming'),
      )
      expect(JSON.stringify(incoming.body)).not.toContain(pending)
      expect(await pendingFor('ada')).toBe(before - 1)
      await as('ada')(
        request(app).post(`/api/connections/${pending}/accept`),
      ).expect(404)
    } finally {
      await setStatus('dee', 'active')
    }
  })
})
