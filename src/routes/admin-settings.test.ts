import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { loadConfig } from '../config.js'
import { configPolicy } from '../permissions.js'
import { createMemorySettingOverrideStore } from '../services/memory-setting-override-store.js'
import { createSettings, type SettingsService } from '../services/settings.js'
import type { SettingView, SettingsGroup } from '../settings-view.js'
import { adminSettingsRoutes } from './admin-settings.js'

const config = loadConfig({
  DATABASE_URL: 'postgres://user:pw@localhost:5432/rebel_match',
  SESSION_SECRET: 'x'.repeat(32),
})
const auth = createAuth({
  store: createMemoryAuthStore([
    { id: 'm-admin', email: 'a@example.invalid', roles: ['member', 'admin'] },
    { id: 'm-member', email: 'm@example.invalid', roles: ['member'] },
  ]),
  policy: configPolicy,
  deliver: () => Promise.resolve(),
  config,
})

const CEILING = 'abuse.applicantsCeiling'

function setup(): { app: Express; settings: SettingsService } {
  const settings = createSettings({
    config,
    store: createMemorySettingOverrideStore({ 'm-admin': 'Ada Host' }),
    now: () => new Date('2026-11-08T09:00:00Z'),
  })
  const app = express()
  app.use(express.json())
  app.use(adminSettingsRoutes({ auth, config, settings }))
  return { app, settings }
}

async function cookieFor(memberId: string): Promise<string> {
  const cookie = await auth.createSession(memberId)
  return `${cookie.name}=${cookie.value}`
}

function setting(body: unknown, key: string): SettingView | undefined {
  return (body as { groups: SettingsGroup[] }).groups
    .flatMap((group) => group.settings)
    .find((candidate) => candidate.edit?.key === key)
}

describe('GET /api/admin/settings', () => {
  it('shows the settings in groups to a holder of settings:read (R-CFG-5)', async () => {
    const response = await request(setup().app)
      .get('/api/admin/settings')
      .set('Cookie', await cookieFor('m-admin'))

    expect(response.status).toBe(200)
    const body = response.body as { groups: { title: string }[] }
    expect(body.groups.map((group) => group.title)).toContain('Spam protection')
  })

  it('names no environment variable (R-CFG-5)', async () => {
    const response = await request(setup().app)
      .get('/api/admin/settings')
      .set('Cookie', await cookieFor('m-admin'))

    expect(JSON.stringify(response.body)).not.toMatch(
      /envVar|APPLICANTS_CEILING|SESSION_SECRET/,
    )
  })

  it('says how a changeable setting is edited (R-CFG-6)', async () => {
    const response = await request(setup().app)
      .get('/api/admin/settings')
      .set('Cookie', await cookieFor('m-admin'))

    expect(setting(response.body, CEILING)?.edit).toEqual({
      key: CEILING,
      value: 300,
      unit: 'applicants',
      min: 1,
      max: 100_000,
    })
  })

  it('is not found for a member without settings:read (R-NAV-8)', async () => {
    const response = await request(setup().app)
      .get('/api/admin/settings')
      .set('Cookie', await cookieFor('m-member'))

    expect(response.status).toBe(404)
  })

  it('refuses a visitor who is not signed in', async () => {
    const response = await request(setup().app).get('/api/admin/settings')

    expect(response.status).toBe(401)
  })
})

describe('PUT /api/admin/settings/:key (R-CFG-6, ADR 0031)', () => {
  it('changes the value at once and says who changed it', async () => {
    const { app, settings } = setup()

    const response = await request(app)
      .put(`/api/admin/settings/${CEILING}`)
      .set('Cookie', await cookieFor('m-admin'))
      .send({ value: 500 })

    expect(response.status).toBe(200)
    expect(settings.abuse().applicantsCeiling).toBe(500)
    expect(setting(response.body, CEILING)).toMatchObject({
      value: '500 applicants',
      changed: true,
      override: {
        by: 'Ada Host',
        at: '2026-11-08T09:00:00.000Z',
        deploymentValue: '300 applicants',
      },
    })
  })

  it.each([{ value: 0 }, { value: 2.5 }, { value: '500' }, {}])(
    'refuses %j',
    async (body) => {
      const { app, settings } = setup()

      const response = await request(app)
        .put(`/api/admin/settings/${CEILING}`)
        .set('Cookie', await cookieFor('m-admin'))
        .send(body)

      expect(response.status).toBe(400)
      expect(settings.abuse().applicantsCeiling).toBe(300)
    },
  )

  it('refuses a ceiling below its free uses', async () => {
    const response = await request(setup().app)
      .put(`/api/admin/settings/${CEILING}`)
      .set('Cookie', await cookieFor('m-admin'))
      .send({ value: 10 })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'out_of_order' })
  })

  it.each(['trustProxy', 'limits.nameMaxChars', 'sessionSecret'])(
    'is not found for %s, which cannot be changed in the app',
    async (key) => {
      const response = await request(setup().app)
        .put(`/api/admin/settings/${key}`)
        .set('Cookie', await cookieFor('m-admin'))
        .send({ value: 1 })

      expect(response.status).toBe(404)
    },
  )

  it('is not found for a member without settings:manage', async () => {
    const { app, settings } = setup()

    const response = await request(app)
      .put(`/api/admin/settings/${CEILING}`)
      .set('Cookie', await cookieFor('m-member'))
      .send({ value: 500 })

    expect(response.status).toBe(404)
    expect(settings.abuse().applicantsCeiling).toBe(300)
  })
})

describe('DELETE /api/admin/settings/:key (R-CFG-6)', () => {
  it('goes back to the deployment’s value', async () => {
    const { app, settings } = setup()
    const cookie = await cookieFor('m-admin')
    await request(app)
      .put(`/api/admin/settings/${CEILING}`)
      .set('Cookie', cookie)
      .send({ value: 500 })

    const response = await request(app)
      .delete(`/api/admin/settings/${CEILING}`)
      .set('Cookie', cookie)

    expect(response.status).toBe(200)
    expect(settings.abuse().applicantsCeiling).toBe(300)
    expect(setting(response.body, CEILING)).not.toHaveProperty('override')
  })

  it('refuses when going back would put a ceiling below its free uses', async () => {
    const { app } = setup()
    const cookie = await cookieFor('m-admin')
    await request(app)
      .put(`/api/admin/settings/${CEILING}`)
      .set('Cookie', cookie)
      .send({ value: 500 })
    await request(app)
      .put('/api/admin/settings/abuse.applicantsBeforeCheck')
      .set('Cookie', cookie)
      .send({ value: 400 })

    const response = await request(app)
      .delete(`/api/admin/settings/${CEILING}`)
      .set('Cookie', cookie)

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'out_of_order' })
  })

  it('is not found for a member without settings:manage', async () => {
    const response = await request(setup().app)
      .delete(`/api/admin/settings/${CEILING}`)
      .set('Cookie', await cookieFor('m-member'))

    expect(response.status).toBe(404)
  })
})
