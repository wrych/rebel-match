import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { loadConfig } from '../config.js'
import { configPolicy } from '../permissions.js'
import {
  createEditableSettings,
  type Override,
} from '../services/editable-settings.js'
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

function app(): Express {
  const rows: Override[] = []
  // Its own copy: a change in one test must not reach the next.
  const live = loadConfig({
    DATABASE_URL: 'postgres://user:pw@localhost:5432/rebel_match',
    SESSION_SECRET: 'x'.repeat(32),
  })
  const settings = createEditableSettings({
    config: live,
    store: {
      list: () => Promise.resolve([...rows]),
      save: (key, value, memberId) => {
        rows.splice(0, rows.length, ...rows.filter((r) => r.key !== key))
        rows.push({
          key,
          value,
          changedBy: memberId,
          changedByName: 'Ada Admin',
          changedAt: new Date('2026-10-04T19:00:00Z'),
        })
        return Promise.resolve()
      },
      remove: (key) => {
        rows.splice(0, rows.length, ...rows.filter((r) => r.key !== key))
        return Promise.resolve()
      },
    },
  })
  const server = express()
  server.use(express.json())
  server.use(adminSettingsRoutes({ auth, config: live, settings }))
  return server
}

interface Shown {
  groups: {
    settings: {
      editable?: { key: string; number: number }
      override?: { by: string | null; deploymentValue: string }
    }[]
  }[]
}

function setting(body: Shown, key: string): Shown['groups'][0]['settings'][0] {
  const found = body.groups
    .flatMap((g) => g.settings)
    .find((s) => s.editable?.key === key)
  if (found === undefined) throw new Error(`no setting ${key}`)
  return found
}

async function cookieFor(memberId: string): Promise<string> {
  const cookie = await auth.createSession(memberId)
  return `${cookie.name}=${cookie.value}`
}

describe('GET /api/admin/settings', () => {
  it('shows the settings in groups to a holder of settings:read (R-CFG-5)', async () => {
    const response = await request(app())
      .get('/api/admin/settings')
      .set('Cookie', await cookieFor('m-admin'))

    expect(response.status).toBe(200)
    const body = response.body as { groups: { title: string }[] }
    expect(body.groups.map((group) => group.title)).toContain('Spam protection')
  })

  it('is not found for a member without settings:read (R-NAV-8)', async () => {
    const response = await request(app())
      .get('/api/admin/settings')
      .set('Cookie', await cookieFor('m-member'))

    expect(response.status).toBe(404)
  })

  it('refuses a visitor who is not signed in', async () => {
    const response = await request(app()).get('/api/admin/settings')

    expect(response.status).toBe(401)
  })
})

describe('PUT and DELETE /api/admin/settings/:key (R-CFG-6)', () => {
  it('changes a value, shows who changed it, and goes back', async () => {
    const server = app()
    const cookie = await cookieFor('m-admin')

    const put = await request(server)
      .put('/api/admin/settings/abuse.applicantsCeiling')
      .set('Cookie', cookie)
      .send({ value: 500 })
    expect(put.status).toBe(204)

    const shown = await request(server)
      .get('/api/admin/settings')
      .set('Cookie', cookie)
    expect(
      setting(shown.body as Shown, 'abuse.applicantsCeiling'),
    ).toMatchObject({
      editable: { number: 500 },
      override: { by: 'Ada Admin', deploymentValue: '300 applicants' },
    })

    const reset = await request(server)
      .delete('/api/admin/settings/abuse.applicantsCeiling')
      .set('Cookie', cookie)
    expect(reset.status).toBe(204)
    const after = await request(server)
      .get('/api/admin/settings')
      .set('Cookie', cookie)
    const back = setting(after.body as Shown, 'abuse.applicantsCeiling')
    expect(back.editable?.number).toBe(300)
    expect(back).not.toHaveProperty('override')
  })

  it.each([
    [{ value: 0 }, 'out_of_bounds'],
    [{ value: 29 }, 'out_of_order'],
    [{ value: 'many' }, 'bad_request'],
  ])('refuses %j with 400 %s', async (body, error) => {
    const response = await request(app())
      .put('/api/admin/settings/abuse.applicantsCeiling')
      .set('Cookie', await cookieFor('m-admin'))
      .send(body)

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error })
  })

  it.each(['abuse.trustProxy', 'limits.nameMaxChars', 'sessionSecret'])(
    'is not found for %s, which cannot change in the app',
    async (key) => {
      const response = await request(app())
        .put(`/api/admin/settings/${key}`)
        .set('Cookie', await cookieFor('m-admin'))
        .send({ value: 5 })

      expect(response.status).toBe(404)
    },
  )

  it('is not found for a member without settings:manage (R-NAV-8)', async () => {
    const response = await request(app())
      .put('/api/admin/settings/abuse.applicantsCeiling')
      .set('Cookie', await cookieFor('m-member'))
      .send({ value: 500 })

    expect(response.status).toBe(404)
  })

  it('refuses with 400 to go back across a pair', async () => {
    const server = app()
    const cookie = await cookieFor('m-admin')
    for (const [key, value] of [
      ['abuse.linkEmailsCeiling', 20],
      ['abuse.linkEmailsBeforeCheck', 15],
    ] as const) {
      await request(server)
        .put(`/api/admin/settings/${key}`)
        .set('Cookie', cookie)
        .send({ value })
    }

    const response = await request(server)
      .delete('/api/admin/settings/abuse.linkEmailsCeiling')
      .set('Cookie', cookie)

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'out_of_order' })
  })
})
