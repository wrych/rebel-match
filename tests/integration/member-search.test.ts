import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { composeApp } from '../../src/compose.js'
import { loadConfig } from '../../src/config.js'
import { planSeed } from '../../src/seed/plan.js'
import { applySeed } from '../../src/seed/run.js'
import {
  openTestDatabase,
  testDatabaseUrl,
  type TestDatabase,
} from './support/database.js'

const config = loadConfig({
  DATABASE_URL: testDatabaseUrl,
  SESSION_SECRET: 'integration-session-secret-of-32-chars',
  NODE_ENV: 'test',
  SEED_PROFILE: 'dev',
  MEMBER_SEARCH: '1',
  MEMBER_SEARCH_MAX_RESULTS: '2',
})

const people = [
  ['qs-caller', 'Quoxa Caller', 'Quoxworks', 'Facilitator', 'active', true],
  ['qs-zoe', 'Zoë Quoxbery', 'Quox & Partners', 'Agile coach', 'active', true],
  ['qs-jean', 'Jean-Luc Quoxton', 'Quoxworks', 'Coach', 'active', true],
  ['qs-quox', 'Ada Quox', 'Other 100%_Co', 'Head of people', 'active', true],
  ['qs-hidden', 'Hilde Quoxley', 'Quoxworks', 'Coach', 'active', false],
  ['qs-banned', 'Bert Quoxman', 'Quoxworks', 'Coach', 'banned', true],
  ['qs-ram', 'राम Quoxi', 'Quoxguild', 'Guide', 'active', true],
  ['qs-new', null, 'Quoxworks', 'Coach', 'active', true],
] as const

let db: TestDatabase
let app: ReturnType<typeof createApp>
let cookie = ''

async function clear(): Promise<void> {
  await db.query("DELETE FROM connection_requests WHERE id = 'qs-conn'")
  await db.query("DELETE FROM members WHERE id LIKE 'qs-%'")
  await db.query("DELETE FROM sectors WHERE key = 'qs-quoxcraft'")
}

beforeAll(async () => {
  db = await openTestDatabase()
  await applySeed(db.drizzle, planSeed(config), config.consentVersion)
  await clear()
  await db.query(
    "INSERT INTO sectors (key, label) VALUES ('qs-quoxcraft', 'Quoxcraft & making')",
  )
  for (const [id, name, org, title, status, findable] of people)
    await db.query(
      'INSERT INTO members (id, email, name, org, job_title, status, findable, analytics_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, `${id}@example.invalid`, name, org, title, status, findable, id],
    )
  await db.query(
    "UPDATE members SET sector = 'qs-quoxcraft' WHERE id = 'qs-quox'",
  )
  await db.query(
    "UPDATE members SET consent_version = ?, consent_at = now() WHERE id = 'qs-caller'",
    [config.consentVersion],
  )
  await db.query(
    "INSERT INTO member_roles (member_id, role_key) VALUES ('qs-caller', 'member')",
  )
  const deps = composeApp(config, db.drizzle)
  app = createApp(deps)
  const session = await deps.auth.createSession('qs-caller')
  cookie = `${session.name}=${session.value}`
})

afterAll(async () => {
  await clear()
  await db.close()
})

async function search(q: string): Promise<{ names: string[]; more: boolean }> {
  const response = await request(app)
    .get('/api/members/search')
    .query({ q })
    .set('Cookie', cookie)
  expect(response.status).toBe(200)
  const body = response.body as { results: { name: string }[]; more: boolean }
  return { names: body.results.map((card) => card.name), more: body.more }
}

describe('member search on Postgres (R-FIND-2, R-FIND-3)', () => {
  it('matches the start of any word of the name, ignoring case and accents', async () => {
    expect((await search('ZOE')).names).toEqual(['Zoë Quoxbery'])
    expect((await search('luc quox')).names).toEqual(['Jean-Luc Quoxton'])
    expect((await search('oxbery')).names).toEqual([])
    expect((await search('राम')).names).toEqual(['राम Quoxi'])
  })

  it('ranks a whole word before a prefix, then by name, and says more match', async () => {
    expect(await search('quox')).toEqual({
      names: ['Ada Quox', 'Jean-Luc Quoxton'],
      more: true,
    })
  })

  it('never returns the caller, a member hidden, banned or not onboarded', async () => {
    const { names } = await search('company:quoxworks')

    expect(names).toEqual(['Jean-Luc Quoxton'])
  })

  it('ANDs every term, field by field, phrases included', async () => {
    expect((await search('company:"quox &" title:agile')).names).toEqual([
      'Zoë Quoxbery',
    ])
    expect((await search('sector:quoxcraft')).names).toEqual(['Ada Quox'])
    expect((await search('sector:qs-quoxcraft quox')).names).toEqual([
      'Ada Quox',
    ])
    expect((await search('quox title:agile company:quoxworks')).names).toEqual(
      [],
    )
  })

  it('reads % and _ as themselves, never as wildcards', async () => {
    expect((await search('company:100%')).names).toEqual(['Ada Quox'])
    expect((await search('company:1%')).names).toEqual([])
    expect((await search('company:o_her')).names).toEqual([])
  })

  it('opens a card search would find, and only that (R-FIND-6)', async () => {
    const found = await request(app)
      .get('/api/members/qs-zoe/card')
      .set('Cookie', cookie)
    const hidden = await request(app)
      .get('/api/members/qs-hidden/card')
      .set('Cookie', cookie)

    expect(found.body).toEqual({
      card: {
        memberId: 'qs-zoe',
        name: 'Zoë Quoxbery',
        jobTitle: 'Agile coach',
        org: 'Quox & Partners',
        sector: null,
        companySize: null,
        connectionId: null,
      },
    })
    expect(hidden.status).toBe(404)
  })

  it('names the connection to open for a member already connected (R-CONN-8)', async () => {
    await db.query(
      "INSERT INTO connection_requests (id, requester_id, target_id, kind, status, responded_at) VALUES ('qs-conn', 'qs-zoe', 'qs-caller', 'same_boat', 'accepted', now())",
    )

    const found = await request(app)
      .get('/api/members/qs-zoe/card')
      .set('Cookie', cookie)
    const searched = await request(app)
      .get('/api/members/search')
      .query({ q: 'zoe' })
      .set('Cookie', cookie)

    expect(found.body).toMatchObject({ card: { connectionId: 'qs-conn' } })
    expect(searched.body).toMatchObject({
      results: [{ name: 'Zoë Quoxbery', connectionId: 'qs-conn' }],
    })
  })
})
