import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { loadConfig } from '../config.js'
import { configPolicy } from '../permissions.js'
import type { OwnProfile, ProfileEdit } from '../services/profile.js'
import { profileRoutes } from './profile.js'

const config = loadConfig({
  DATABASE_URL: 'postgres://user:pw@localhost:5432/rebel_match',
  SESSION_SECRET: 'x'.repeat(32),
})
const auth = createAuth({
  store: createMemoryAuthStore([
    { id: 'm-ada', email: 'ada@example.invalid', roles: ['member'] },
  ]),
  policy: configPolicy,
  deliver: () => Promise.resolve(),
  config,
})
const own: OwnProfile = {
  name: 'Ada',
  jobTitle: 'Coach',
  org: null,
  sector: null,
  companySize: null,
  email: 'ada@example.invalid',
  consentVersion: '2026-11-01',
  consentAt: '2026-11-08T10:00:00.000Z',
  analyticsOptIn: false,
}

function setup(): {
  app: Express
  edits: { memberId: string; edit: ProfileEdit }[]
} {
  const edits: { memberId: string; edit: ProfileEdit }[] = []
  const app = express()
  app.use(express.json())
  app.use(
    profileRoutes({
      auth,
      config,
      profile: {
        own: (memberId) => Promise.resolve(memberId === 'm-ada' ? own : null),
        update: (memberId, edit) => {
          edits.push({ memberId, edit })
          return Promise.resolve()
        },
      },
    }),
  )
  return { app, edits }
}

async function cookie(): Promise<string> {
  const session = await auth.createSession('m-ada')
  return `${session.name}=${session.value}`
}

describe('GET /api/profile', () => {
  it('shows the member their own profile and privacy (R-PROF-1,2)', async () => {
    const response = await request(setup().app)
      .get('/api/profile')
      .set('Cookie', await cookie())

    expect(response.status).toBe(200)
    expect(response.body).toEqual(own)
  })

  it('asks for a session', async () => {
    expect((await request(setup().app).get('/api/profile')).status).toBe(401)
  })
})

describe('PUT /api/profile', () => {
  it('saves the edit, trimmed, a blank optional field cleared (R-PROF-1)', async () => {
    const { app, edits } = setup()

    const response = await request(app)
      .put('/api/profile')
      .set('Cookie', await cookie())
      .send({ name: '  Ada Rebel ', jobTitle: '', org: 'Rebels' })

    expect(response.status).toBe(204)
    expect(edits).toEqual([
      {
        memberId: 'm-ada',
        edit: { name: 'Ada Rebel', jobTitle: undefined, org: 'Rebels' },
      },
    ])
  })

  it('saves a sector and company size picked from the lists (R-PROF-1)', async () => {
    const { app, edits } = setup()

    const response = await request(app)
      .put('/api/profile')
      .set('Cookie', await cookie())
      .send({ name: 'Ada', sector: 'Retail', companySize: '1001+' })

    expect(response.status).toBe(204)
    expect(edits[0]?.edit).toMatchObject({
      sector: 'Retail',
      companySize: '1001+',
    })
  })

  it.each([
    ['a blank name', { name: '   ' }],
    ['a sector not on the list', { name: 'Ada', sector: 'Health' }],
    ['a company size not on the list', { name: 'Ada', companySize: '260' }],
    ['no name', { org: 'Rebels' }],
    [
      'a name over the limit',
      { name: 'x'.repeat(config.limits.nameMaxChars + 1) },
    ],
    [
      'an organization over the limit',
      { name: 'Ada', org: 'x'.repeat(config.limits.orgMaxChars + 1) },
    ],
  ])('refuses %s with 400 and saves nothing', async (_case, body) => {
    const { app, edits } = setup()

    const response = await request(app)
      .put('/api/profile')
      .set('Cookie', await cookie())
      .send(body)

    expect(response.status).toBe(400)
    expect(edits).toEqual([])
  })

  it('asks for a session', async () => {
    const response = await request(setup().app)
      .put('/api/profile')
      .send({ name: 'Ada' })

    expect(response.status).toBe(401)
  })
})
