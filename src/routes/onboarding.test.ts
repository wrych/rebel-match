import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { loadConfig } from '../config.js'
import { configPolicy } from '../permissions.js'
import type {
  OnboardingInput,
  OnboardingOutcome,
} from '../services/onboarding.js'
import { onboardingRoutes } from './onboarding.js'

const config = loadConfig({
  DATABASE_URL: 'postgres://user:pw@localhost:5432/rebel_match',
  SESSION_SECRET: 'x'.repeat(32),
})
const auth = createAuth({
  store: createMemoryAuthStore([
    { id: 'm-new', email: 'n@example.invalid', roles: ['member'] },
  ]),
  policy: configPolicy,
  deliver: () => Promise.resolve(),
  config,
})
const draft = { name: 'Door Name', jobTitle: null, org: 'Rebels', sector: null }

function setup(outcome: OnboardingOutcome = 'done'): {
  app: Express
  completed: { memberId: string; input: OnboardingInput }[]
} {
  const completed: { memberId: string; input: OnboardingInput }[] = []
  const app = express()
  app.use(express.json())
  app.use(
    onboardingRoutes({
      auth,
      config,
      onboarding: {
        draft: () => Promise.resolve(draft),
        complete: (memberId, input) => {
          completed.push({ memberId, input })
          return Promise.resolve(outcome)
        },
      },
    }),
  )
  return { app, completed }
}

async function cookie(): Promise<string> {
  const session = await auth.createSession('m-new')
  return `${session.name}=${session.value}`
}

describe('GET /api/onboarding', () => {
  it('pre-fills the form and names the consent version in force (F2)', async () => {
    const response = await request(setup().app)
      .get('/api/onboarding')
      .set('Cookie', await cookie())

    expect(response.body).toEqual({
      ...draft,
      consentVersion: config.consentVersion,
    })
  })

  it('asks for a session', async () => {
    expect((await request(setup().app).get('/api/onboarding')).status).toBe(401)
  })
})

describe('POST /api/onboarding', () => {
  it('completes onboarding for the signed-in member, trimming (R-ONB-1..3)', async () => {
    const { app, completed } = setup()

    const response = await request(app)
      .post('/api/onboarding')
      .set('Cookie', await cookie())
      .send({
        name: '  Ada  ',
        jobTitle: '',
        org: 'Rebels',
        consentVersion: config.consentVersion,
      })

    expect(response.status).toBe(204)
    expect(completed).toEqual([
      {
        memberId: 'm-new',
        input: {
          name: 'Ada',
          jobTitle: undefined,
          org: 'Rebels',
          sector: undefined,
          consentVersion: config.consentVersion,
        },
      },
    ])
  })

  it('answers 409 when the consent accepted is no longer current (R-ONB-4)', async () => {
    const response = await request(setup('stale_consent').app)
      .post('/api/onboarding')
      .set('Cookie', await cookie())
      .send({ name: 'Ada', consentVersion: 'old' })

    expect(response.status).toBe(409)
  })

  it.each([
    { consentVersion: '2026-11-01' },
    { name: '   ', consentVersion: '2026-11-01' },
    { name: 'Ada' },
    { name: 'x'.repeat(121), consentVersion: '2026-11-01' },
    { name: 'Ada', jobTitle: 'x'.repeat(121), consentVersion: '2026-11-01' },
    { name: 'Ada', sector: 'x'.repeat(161), consentVersion: '2026-11-01' },
  ])('refuses %j without completing anything', async (body) => {
    const { app, completed } = setup()

    const response = await request(app)
      .post('/api/onboarding')
      .set('Cookie', await cookie())
      .send(body)

    expect(response.status).toBe(400)
    expect(completed).toEqual([])
  })

  it('asks for a session', async () => {
    const { app, completed } = setup()

    const response = await request(app)
      .post('/api/onboarding')
      .send({ name: 'Ada', consentVersion: config.consentVersion })

    expect(response.status).toBe(401)
    expect(completed).toEqual([])
  })
})
