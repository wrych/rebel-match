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

beforeAll(async () => {
  db = await openTestDatabase()
  await applySeed(db.drizzle, planSeed(config), config.consentVersion)
  const deps = composeApp(config, db.drizzle)
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
    "DELETE FROM outbox WHERE kind = 'connection_request' AND member_id IN (?)",
    [Object.values(ids)],
  )
  const challenge = await db.query(
    'SELECT id FROM challenges WHERE member_id = ? LIMIT 1',
    [ids['bob']],
  )
  bobChallenge = String(challenge[0]?.['id'])
})

afterAll(async () => {
  await db.query(
    'DELETE FROM connection_requests WHERE requester_id IN (?) OR target_id IN (?)',
    [Object.values(ids), Object.values(ids)],
  )
  await db.close()
})

function as(who: string): (r: request.Test) => request.Test {
  return (r) => r.set('Cookie', cookies[who]!)
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
    const logged = await db.query(
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
