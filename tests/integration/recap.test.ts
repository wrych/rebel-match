import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { composeApp } from '../../src/compose.js'
import type { BadgeOverview } from '../../src/services/badges.js'
import type { Recap } from '../../src/services/recap.js'
import type { TestDatabase } from './support/database.js'
import {
  cookieFor,
  idOf,
  openSeededDatabase,
  testConfig,
} from './support/app.js'

const env = {
  SEED_PROFILE: 'dev',
  NETWORK_MIN_OWN_CONNECTIONS: '0',
}
const config = testConfig({ ...env, RECAP: '1' })
const member = 'milan.horvat@example.invalid'

let db: TestDatabase
let deps: ReturnType<typeof composeApp>
let cookie: string

async function recap(app = createApp(deps)): Promise<request.Response> {
  return request(app).get('/api/recap').set('Cookie', cookie)
}

beforeAll(async () => {
  db = await openSeededDatabase(config)
  deps = composeApp(config, db.drizzle)
  cookie = await cookieFor(deps.auth, await idOf(db, member))
})

afterAll(async () => {
  await db.close()
})

describe('the summit recap over Postgres (R-RECAP-1..4)', () => {
  it('counts what the badges count, for the four counted rows', async () => {
    const response = await recap()
    const badges = await request(createApp(deps))
      .get('/api/badges')
      .set('Cookie', cookie)

    expect(response.status).toBe(200)
    const body = response.body as Recap
    const overview = badges.body as BadgeOverview
    expect(body.rows.map((row) => row.row)).toEqual([
      'speak',
      'help',
      'boat',
      'connect',
    ])
    for (const row of body.rows)
      expect(row.count).toBe(
        overview.rows.find((each) => each.row === row.row)?.count,
      )
  })

  it('marks only the caller and names nobody (R-RECAP-4)', async () => {
    const body = (await recap()).body as Recap
    const names = await db.query(
      'SELECT name FROM members WHERE name IS NOT NULL AND email <> ? LIMIT 20',
      [member],
    )

    expect(body.timeline.nodes.filter((node) => node.self)).toHaveLength(1)
    expect(body.joined).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const text = JSON.stringify(body)
    for (const row of names) expect(text).not.toContain(String(row['name']))
    expect(text).not.toContain('@')
  })

  it('compares in rounded shares only (R-RECAP-3)', async () => {
    const body = (await recap()).body as Recap

    for (const row of body.rows)
      if (row.below !== null) expect(row.below % 5).toBe(0)
  })

  it('is not found while hosts have it off (R-RECAP-1)', async () => {
    const off = createApp(composeApp(testConfig(env), db.drizzle))

    expect((await recap(off)).status).toBe(404)
  })
})
