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
  CONNECT_CODES: '1',
})
const people = {
  tobias: 'tobias.renner@example.invalid',
  ana: 'ana.ferreira@example.invalid',
}

let db: TestDatabase
let app: ReturnType<typeof createApp>
const ids: Record<string, string> = {}
const cookies: Record<string, string> = {}

async function clear(): Promise<void> {
  const members = Object.values(ids)
  await db.query('DELETE FROM profile_codes WHERE member_id IN (?)', [members])
  await db.query(
    'DELETE FROM connection_requests WHERE requester_id IN (?) OR target_id IN (?)',
    [members, members],
  )
  await db.query('UPDATE members SET findable = true WHERE id IN (?)', [
    members,
  ])
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

interface Caller {
  get: (path: string) => request.Test
  post: (path: string, body?: object) => request.Test
  patch: (path: string, body: object) => request.Test
}

const as = (who: string): Caller => ({
  get: (path: string) =>
    request(app)
      .get(path)
      .set('Cookie', cookies[who] ?? ''),
  post: (path: string, body?: object) =>
    request(app)
      .post(path)
      .set('Cookie', cookies[who] ?? '')
      .send(body),
  patch: (path: string, body: object) =>
    request(app)
      .patch(path)
      .set('Cookie', cookies[who] ?? '')
      .send(body),
})

describe('profile codes on Postgres (R-CODE-2..4, F26)', () => {
  it('opens the owner’s card, unfindable or not, and connects through it', async () => {
    await db.query('UPDATE members SET findable = false WHERE id = ?', [
      ids['ana'],
    ])
    const mine = await as('ana').get('/api/me/profile-code')
    const { token } = mine.body as { token: string; enabled: boolean }

    const opened = await as('tobias').post('/api/profile-codes/open', {
      token,
    })
    const sent = await as('tobias').post('/api/connections', {
      targetId: ids['ana'],
      kind: 'direct',
      profileCode: token,
    })
    const withoutCode = await as('tobias').post('/api/connections', {
      targetId: ids['ana'],
      kind: 'direct',
    })

    expect(mine.body).toEqual({ token, enabled: true })
    expect(token).toMatch(/^[\w-]{43}$/)
    expect(token).not.toContain(ids['ana'])
    expect(opened.body).toMatchObject({
      memberId: ids['ana'],
      card: { memberId: ids['ana'] },
    })
    expect(JSON.stringify(opened.body)).not.toContain('@')
    expect(sent.status).toBe(201)
    expect(withoutCode.status).toBe(404)
  })

  it('is not found for the owner’s own visit', async () => {
    const { token } = (await as('ana').get('/api/me/profile-code')).body as {
      token: string
    }

    expect(
      (await as('ana').post('/api/profile-codes/open', { token })).status,
    ).toBe(404)
  })

  it('is not found while off, and the same code again once on', async () => {
    const { token } = (await as('ana').get('/api/me/profile-code')).body as {
      token: string
    }

    await as('ana').patch('/api/me/profile-code', { enabled: false })
    const off = await as('tobias').post('/api/profile-codes/open', { token })
    const on = await as('ana').patch('/api/me/profile-code', { enabled: true })
    const again = await as('tobias').post('/api/profile-codes/open', { token })

    expect(off.status).toBe(404)
    expect(on.body).toEqual({ token, enabled: true })
    expect(again.status).toBe(200)
  })

  it('stops the old code the moment it is reset', async () => {
    const { token } = (await as('ana').get('/api/me/profile-code')).body as {
      token: string
    }

    const reset = await as('ana').post('/api/me/profile-code/reset')
    const fresh = (reset.body as { token: string }).token
    const old = await as('tobias').post('/api/profile-codes/open', { token })
    const now = await as('tobias').post('/api/profile-codes/open', {
      token: fresh,
    })

    expect(fresh).not.toBe(token)
    expect(old.status).toBe(404)
    expect(now.status).toBe(200)
  })
})
