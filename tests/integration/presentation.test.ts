import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { composeApp } from '../../src/compose.js'
import type { Presentation } from '../../src/services/presentation.js'
import { DEV_ADMIN_EMAIL } from '../../src/seed/dev/people.js'
import type { TestDatabase } from './support/database.js'
import {
  cookieFor,
  idOf,
  openSeededDatabase,
  testConfig,
} from './support/app.js'

const config = testConfig({
  NODE_ENV: 'development',
  MAIL_DELIVERY: 'none',
  PUBLIC_URL: 'http://localhost:5173',
  SEED_PROFILE: 'dev',
})

let db: TestDatabase
let app: ReturnType<typeof createApp>
let host: string
let member: string

beforeAll(async () => {
  db = await openSeededDatabase(config)
  const deps = composeApp(config, db.drizzle)
  app = createApp(deps)
  host = await cookieFor(deps.auth, await idOf(db, DEV_ADMIN_EMAIL))
  member = await cookieFor(
    deps.auth,
    await idOf(db, 'milan.horvat@example.invalid'),
  )
})

afterAll(async () => {
  await db.close()
})

describe('the presentation over Postgres (R-PRES-5, R-PRES-6)', () => {
  it('places the stand-in cast on the dev seed, sending no email', async () => {
    const response = await request(app)
      .get('/api/admin/presentation')
      .set('Cookie', host)
    const body = response.body as Presentation
    const pioneer = body.cast.find((each) => each.handle === 'pioneer')
    const founder = body.cast.find((each) => each.handle === 'founder-one')

    expect(response.status).toBe(200)
    expect(pioneer?.node).toEqual(expect.any(Number))
    expect(founder?.node).toBeNull()
    expect(body.timeline.nodes.some((node) => node.self)).toBe(false)
    expect(JSON.stringify(body)).not.toContain('@')
  })

  it('is not found for a member who is not a host', async () => {
    const response = await request(app)
      .get('/api/admin/presentation')
      .set('Cookie', member)

    expect(response.status).toBe(404)
  })
})
