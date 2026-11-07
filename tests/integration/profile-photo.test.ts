import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { composeApp } from '../../src/compose.js'
import { openTestDatabase, type TestDatabase } from './support/database.js'
import { cookieFor, testConfig } from './support/app.js'

const config = testConfig({ PROFILE_PHOTOS: '1' })
const member = { id: randomUUID(), email: `${randomUUID()}@example.invalid` }

const segment = (marker: number, payload: number[]): number[] => [
  0xff,
  marker,
  0,
  payload.length + 2,
  ...payload,
]
const JFIF = segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0])
const EXIF = segment(0xe1, [...Buffer.from('Exif\0\0GPS', 'latin1')])
const FRAME = segment(0xc0, [8, 0, 64, 0, 64, 1, 1, 0x11, 0])
const SCAN = [...segment(0xda, [1, 1, 0, 0, 63, 0]), 0x12, 0x34]
const jpeg = (...parts: number[][]): Buffer =>
  Buffer.from([0xff, 0xd8, ...parts.flat(), 0xff, 0xd9])

let db: TestDatabase
let app: ReturnType<typeof createApp>
let deps: ReturnType<typeof composeApp>
let cookie: string

beforeAll(async () => {
  db = await openTestDatabase()
  await db.query(
    'INSERT INTO members (id, email, name, status, consent_version, ' +
      "consent_at, analytics_id) VALUES (?, ?, 'Ada', 'active', ?, now(), ?)",
    [member.id, member.email, config.consentVersion, randomUUID()],
  )
  deps = composeApp(config, db.drizzle)
  app = createApp(deps)
  cookie = await cookieFor(deps.auth, member.id)
})

afterAll(async () => {
  await db.query('DELETE FROM members WHERE id = ?', [member.id])
  await db.close()
})

describe('the profile photo over Postgres (R-PROF-6)', () => {
  it('keeps the photo without its metadata and serves it to its owner', async () => {
    await request(app)
      .put('/api/profile/photo')
      .set('Cookie', cookie)
      .set('Content-Type', 'image/jpeg')
      .send(jpeg(JFIF, EXIF, FRAME, SCAN))
      .expect(204)

    const shown = await request(app)
      .get('/api/profile/photo')
      .set('Cookie', cookie)
      .expect(200)
    expect(shown.body).toEqual(jpeg(JFIF, FRAME, SCAN))

    const profile = await request(app).get('/api/profile').set('Cookie', cookie)
    const { photoAt } = profile.body as { photoAt: string | null }
    expect(photoAt).not.toBeNull()
    expect(Date.parse(photoAt ?? '')).not.toBeNaN()
  })

  it('replaces the photo with a new one', async () => {
    const other = jpeg(FRAME, SCAN)
    await request(app)
      .put('/api/profile/photo')
      .set('Cookie', cookie)
      .set('Content-Type', 'image/jpeg')
      .send(other)
      .expect(204)
    const shown = await request(app)
      .get('/api/profile/photo')
      .set('Cookie', cookie)
    expect(shown.body).toEqual(other)
  })

  it('removes the photo', async () => {
    await request(app)
      .delete('/api/profile/photo')
      .set('Cookie', cookie)
      .expect(204)
    await request(app)
      .get('/api/profile/photo')
      .set('Cookie', cookie)
      .expect(404)
    const profile = await request(app).get('/api/profile').set('Cookie', cookie)
    expect((profile.body as { photoAt: unknown }).photoAt).toBeNull()
  })

  it('goes with the account when it is erased (R-NFR-7)', async () => {
    const gone = { id: randomUUID(), email: `${randomUUID()}@example.invalid` }
    await db.query(
      'INSERT INTO members (id, email, name, status, analytics_id) ' +
        "VALUES (?, ?, 'Ben', 'active', ?)",
      [gone.id, gone.email, randomUUID()],
    )
    await deps.photos.replace(gone.id, jpeg(FRAME, SCAN))
    expect(await deps.erasure.erase(gone.id)).toBe('erased')
    const rows = await db.query(
      'SELECT member_id FROM member_photos WHERE member_id = ?',
      [gone.id],
    )
    expect(rows).toEqual([])
  })
})
