import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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
  MEMBER_SEARCH: '1',
  SOCIAL_LINKS: '1',
})
const people = {
  tobias: 'tobias.renner@example.invalid',
  ana: 'ana.ferreira@example.invalid',
  priya: 'priya.raman@example.invalid',
}

let db: TestDatabase
let app: ReturnType<typeof createApp>
const ids: Record<string, string> = {}
const cookies: Record<string, string> = {}

async function clear(): Promise<void> {
  await db.query(
    'DELETE FROM connection_requests WHERE requester_id IN (?) OR target_id IN (?)',
    [Object.values(ids), Object.values(ids)],
  )
  await db.query(
    'UPDATE members SET linkedin_url = NULL, instagram_url = NULL WHERE id IN (?)',
    [Object.values(ids)],
  )
}

beforeAll(async () => {
  db = await openSeededDatabase(config)
  const deps = composeApp(config, db.drizzle)
  app = createApp(deps)
  for (const [who, email] of Object.entries(people)) {
    ids[who] = await idOf(db, email)
    cookies[who] = await cookieFor(deps.auth, ids[who])
  }
  await clear()
})

afterAll(async () => {
  await clear()
  await db.close()
})

const as = (who: string): string => cookies[who] ?? ''

describe('social links over Postgres (R-PROF-5)', () => {
  it('keeps the member’s links on their profile', async () => {
    const saved = await request(app)
      .put('/api/me/social-links')
      .set('Cookie', as('tobias'))
      .send({ linkedin: 'linkedin.com/in/tobias', instagram: '@tobias' })
    const own = await request(app)
      .get('/api/profile')
      .set('Cookie', as('tobias'))

    expect(saved.status).toBe(204)
    expect(own.body).toMatchObject({
      socialLinks: {
        linkedin: 'https://linkedin.com/in/tobias',
        instagram: 'https://www.instagram.com/tobias',
      },
    })
  })

  it('shows them on the contact screen of an accepted connection, to its other party only', async () => {
    const sent = await request(app)
      .post('/api/connections')
      .set('Cookie', as('ana'))
      .send({ targetId: ids['tobias'], kind: 'direct' })
    const id = (sent.body as { id: string }).id
    const before = await request(app)
      .get(`/api/connections/${id}/contact`)
      .set('Cookie', as('ana'))
    await request(app)
      .post(`/api/connections/${id}/accept`)
      .set('Cookie', as('tobias'))

    const [forAna, forPriya] = await Promise.all([
      request(app)
        .get(`/api/connections/${id}/contact`)
        .set('Cookie', as('ana')),
      request(app)
        .get(`/api/connections/${id}/contact`)
        .set('Cookie', as('priya')),
    ])

    expect(before.status).toBe(404)
    expect(forAna.body).toMatchObject({
      contact: {
        socialLinks: {
          linkedin: 'https://linkedin.com/in/tobias',
          instagram: 'https://www.instagram.com/tobias',
        },
      },
    })
    expect(forPriya.status).toBe(404)
  })

  it('leaves them off a member’s card in search', async () => {
    const card = await request(app)
      .get(`/api/members/${ids['tobias'] ?? ''}/card`)
      .set('Cookie', as('priya'))

    expect(JSON.stringify(card.body)).not.toContain('linkedin.com')
  })
})
