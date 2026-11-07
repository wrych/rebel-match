import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { handleErrors } from '../app.js'
import { loadConfig } from '../config.js'
import { configPolicy } from '../permissions.js'
import type { PhotoService, StoredPhoto } from '../services/photo.js'
import { profilePhotoRoutes } from './profile-photo.js'

const config = loadConfig({
  DATABASE_URL: 'postgres://user:pw@localhost:5432/rebel_match',
  SESSION_SECRET: 'x'.repeat(32),
})
const auth = createAuth({
  store: createMemoryAuthStore([
    { id: 'm-ada', email: 'a@example.invalid', roles: ['member'] },
  ]),
  policy: configPolicy,
  deliver: () => Promise.resolve(),
  config,
})

const GOOD = Buffer.from('good photo')

function setup(profilePhotos = 1): {
  app: Express
  kept: Map<string, StoredPhoto>
} {
  const kept = new Map<string, StoredPhoto>()
  const photos: PhotoService = {
    own: (memberId) => Promise.resolve(kept.get(memberId) ?? null),
    replace: (memberId, upload) => {
      if (!upload.equals(GOOD)) return Promise.resolve('refused')
      kept.set(memberId, { jpeg: upload, updatedAt: new Date(0) })
      return Promise.resolve('saved')
    },
    remove: (memberId) => {
      kept.delete(memberId)
      return Promise.resolve()
    },
  }
  const app = express()
  app.use(express.json())
  const settings = {
    limits: () => ({ ...config.limits, profilePhotos, photoMaxBytes: 64 }),
  }
  app.use(profilePhotoRoutes({ auth, settings, photos }))
  app.use(handleErrors)
  return { app, kept }
}

async function cookie(): Promise<string> {
  const session = await auth.createSession('m-ada')
  return `${session.name}=${session.value}`
}

describe('/api/profile/photo', () => {
  it('saves a photo and serves it back to its owner as a picture only (R-PROF-5)', async () => {
    const { app } = setup()
    const saved = await request(app)
      .put('/api/profile/photo')
      .set('Cookie', await cookie())
      .set('Content-Type', 'image/jpeg')
      .send(GOOD)
    expect(saved.status).toBe(204)

    const shown = await request(app)
      .get('/api/profile/photo')
      .set('Cookie', await cookie())
    expect(shown.status).toBe(200)
    expect(shown.body).toEqual(GOOD)
    expect(shown.headers['content-type']).toBe('image/jpeg')
    expect(shown.headers['x-content-type-options']).toBe('nosniff')
    expect(shown.headers['content-security-policy']).toContain('sandbox')
    expect(shown.headers['cache-control']).toBe('private, no-cache')
  })

  it('refuses a picture the service will not keep', async () => {
    const response = await request(setup().app)
      .put('/api/profile/photo')
      .set('Cookie', await cookie())
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.from('not a photo'))
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'bad_photo' })
  })

  it('refuses anything but a JPEG body', async () => {
    const response = await request(setup().app)
      .put('/api/profile/photo')
      .set('Cookie', await cookie())
      .send({ photo: 'good photo' })
    expect(response.status).toBe(400)
  })

  it('refuses a body over the size limit before reading it all', async () => {
    const response = await request(setup().app)
      .put('/api/profile/photo')
      .set('Cookie', await cookie())
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.alloc(65))
    expect(response.status).toBe(413)
  })

  it('removes the photo', async () => {
    const { app, kept } = setup()
    kept.set('m-ada', { jpeg: GOOD, updatedAt: new Date(0) })
    const removed = await request(app)
      .delete('/api/profile/photo')
      .set('Cookie', await cookie())
    expect(removed.status).toBe(204)
    expect(kept.has('m-ada')).toBe(false)
  })

  it('answers not found without a photo', async () => {
    const response = await request(setup().app)
      .get('/api/profile/photo')
      .set('Cookie', await cookie())
    expect(response.status).toBe(404)
  })

  it('asks for a session', async () => {
    expect((await request(setup().app).get('/api/profile/photo')).status).toBe(
      401,
    )
  })

  it.each([
    ['GET', 'get'],
    ['PUT', 'put'],
    ['DELETE', 'delete'],
  ] as const)(
    'answers %s as not found while hosts have photos off (R-PROF-5)',
    async (_name, method) => {
      const { app, kept } = setup(0)
      kept.set('m-ada', { jpeg: GOOD, updatedAt: new Date(0) })
      const response = await request(app)
        [method]('/api/profile/photo')
        .set('Cookie', await cookie())
      expect(response.status).toBe(404)
      expect(kept.has('m-ada')).toBe(true)
    },
  )
})
