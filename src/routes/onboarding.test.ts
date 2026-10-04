import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { loadConfig } from '../config.js'
import { configPolicy } from '../permissions.js'
import type { AnalyticsEvent } from '../services/analytics.js'
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
const draft = {
  name: 'Door Name',
  jobTitle: null,
  org: 'Rebels',
  sector: null,
  companySize: null,
  analyticsOptIn: false,
}

function setup(outcome: OnboardingOutcome = 'done'): {
  app: Express
  completed: { memberId: string; input: OnboardingInput }[]
  tracked: [string, AnalyticsEvent][]
} {
  const completed: { memberId: string; input: OnboardingInput }[] = []
  const tracked: [string, AnalyticsEvent][] = []
  const app = express()
  app.use(express.json())
  app.use(
    onboardingRoutes({
      auth,
      config,
      track: (memberId, event) => {
        tracked.push([memberId, event])
        return Promise.resolve()
      },
      onboarding: {
        draft: () => Promise.resolve(draft),
        complete: (memberId, input) => {
          completed.push({ memberId, input })
          return Promise.resolve(outcome)
        },
      },
    }),
  )
  return { app, completed, tracked }
}

async function cookie(): Promise<string> {
  const session = await auth.createSession('m-new')
  return `${session.name}=${session.value}`
}

describe('GET /api/onboarding', () => {
  it('pre-fills the form and names the consent and analytics words in force (F2)', async () => {
    const response = await request(setup().app)
      .get('/api/onboarding')
      .set('Cookie', await cookie())

    expect(response.body).toEqual({
      ...draft,
      consentVersion: config.consentVersion,
      analyticsVersion: config.analyticsVersion,
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
        sector: 'Healthcare',
        companySize: '51-250',
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
          sector: 'Healthcare',
          companySize: '51-250',
          consentVersion: config.consentVersion,
        },
      },
    ])
  })

  it('takes a blank sector and company size as left out (R-ONB-2)', async () => {
    const { app, completed } = setup()

    await request(app)
      .post('/api/onboarding')
      .set('Cookie', await cookie())
      .send({
        name: 'Ada',
        sector: '',
        companySize: '',
        consentVersion: config.consentVersion,
      })

    expect(completed[0]?.input).toMatchObject({
      sector: undefined,
      companySize: undefined,
    })
  })

  it('reports onboarding with the consent version, and not a refused one (R-ANA-1)', async () => {
    const done = setup()
    const stale = setup('stale_consent')
    const body = { name: 'Ada', consentVersion: config.consentVersion }

    await request(done.app)
      .post('/api/onboarding')
      .set('Cookie', await cookie())
      .send(body)
    await request(stale.app)
      .post('/api/onboarding')
      .set('Cookie', await cookie())
      .send(body)

    expect(done.tracked).toEqual([
      [
        'm-new',
        {
          name: 'onboarding_completed',
          consent_version: config.consentVersion,
        },
      ],
    ])
    expect(stale.tracked).toEqual([])
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
    { name: 'Ada', sector: 'Health', consentVersion: '2026-11-01' },
    { name: 'Ada', companySize: '260', consentVersion: '2026-11-01' },
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
