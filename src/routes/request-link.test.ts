import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import type {
  ApplicantDetails,
  LinkRequestState,
} from '../services/admission.js'
import { loadConfig } from '../config.js'
import type { Client } from '../services/applicant-gate.js'
import { requestLinkRoutes } from './request-link.js'

function setup(state: LinkRequestState = 'check-email'): {
  app: Express
  calls: { email: string; next: string | undefined }[]
  described: { handle: string; details: ApplicantDetails }[]
  invites: (string | undefined)[]
  clients: Client[]
} {
  const clients: Client[] = []
  const calls: { email: string; next: string | undefined }[] = []
  const described: { handle: string; details: ApplicantDetails }[] = []
  const invites: (string | undefined)[] = []
  const app = express()
  app.use(express.json())
  app.use(
    requestLinkRoutes({
      config: loadConfig({
        DATABASE_URL: 'postgres://u:p@localhost/db',
        SESSION_SECRET: 'x'.repeat(32),
      }),
      admission: {
        requestLink: (email, opts) => {
          const next = opts.next
          invites.push(opts.invite)
          clients.push(opts.client)
          calls.push({ email, next })
          if (state === 'human-check')
            return Promise.resolve({ state, challenge })
          return Promise.resolve(
            state === 'access-requested' ? { state, handle: 'h.s' } : { state },
          )
        },
        describeApplicant: (handle, details) => {
          described.push({ handle, details })
          return Promise.resolve(handle === 'good' ? 'saved' : 'not-found')
        },
      },
    }),
  )
  return { app, calls, described, invites, clients }
}

const challenge = { parameters: { nonce: 'n' }, signature: 'sig' } as never

describe('POST /auth/request-link', () => {
  it('passes the client address and the solved check to admission (R-NFR-8)', async () => {
    const { app, clients } = setup()

    await request(app)
      .post('/auth/request-link')
      .send({ email: 'ada@example.invalid', altcha: 'solved' })

    expect(clients).toHaveLength(1)
    expect(clients[0]?.altcha).toBe('solved')
    expect(clients[0]?.ip).toMatch(/127\.0\.0\.1|::1/)
  })

  it('carries the challenge with human-check (R-NFR-8)', async () => {
    const { app } = setup('human-check')

    const response = await request(app)
      .post('/auth/request-link')
      .send({ email: 'ada@example.invalid' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ state: 'human-check', challenge })
  })

  it('answers 429 past the applicant ceiling (R-NFR-8)', async () => {
    const { app } = setup('try-later')

    const response = await request(app)
      .post('/auth/request-link')
      .send({ email: 'ada@example.invalid' })

    expect(response.status).toBe(429)
    expect(response.body).toEqual({ error: 'too_many_requests' })
  })

  it.each(['check-email', 'not-approved'] as const)(
    'answers with the next screen, %s (ADR 0013)',
    async (state) => {
      const { app } = setup(state)

      const response = await request(app)
        .post('/auth/request-link')
        .send({ email: 'ada@example.invalid' })

      expect(response.status).toBe(200)
      expect(response.body).toEqual({ state })
    },
  )

  it('carries the handle with access-requested (R-AUTH-11)', async () => {
    const { app } = setup('access-requested')

    const response = await request(app)
      .post('/auth/request-link')
      .send({ email: 'ada@example.invalid' })

    expect(response.body).toEqual({ state: 'access-requested', handle: 'h.s' })
  })

  it('passes the invite token from the QR to admission (R-INV-1)', async () => {
    const { app, invites } = setup()

    await request(app)
      .post('/auth/request-link')
      .send({ email: 'ada@example.invalid', invite: 'tok' })

    expect(invites).toEqual(['tok'])
  })

  it('normalises the address and passes next through', async () => {
    const { app, calls } = setup()

    await request(app)
      .post('/auth/request-link')
      .send({ email: '  Ada@Example.INVALID ', next: '/matches' })

    expect(calls).toEqual([{ email: 'ada@example.invalid', next: '/matches' }])
  })

  it.each([{}, { email: 'not-an-address' }, { email: 42 }])(
    'rejects %j without asking admission',
    async (body) => {
      const { app, calls } = setup()

      const response = await request(app).post('/auth/request-link').send(body)

      expect(response.status).toBe(400)
      expect(calls).toEqual([])
    },
  )
})

describe('POST /auth/applicant', () => {
  it('saves trimmed details and answers 204 (R-AUTH-11,12)', async () => {
    const { app, described } = setup()

    const response = await request(app)
      .post('/auth/applicant')
      .send({ handle: 'good', name: '  Ada  ', org: '' })

    expect(response.status).toBe(204)
    expect(described).toEqual([
      { handle: 'good', details: { name: 'Ada', org: undefined } },
    ])
  })

  it('answers 404 for a handle admission does not find', async () => {
    const { app } = setup()

    const response = await request(app)
      .post('/auth/applicant')
      .send({ handle: 'forged', name: 'Mallory' })

    expect(response.status).toBe(404)
  })

  it.each([
    {},
    { handle: '' },
    { handle: 'good', name: 'x'.repeat(121) },
    { handle: 'good', org: 'x'.repeat(161) },
  ])('rejects %j without asking admission', async (body) => {
    const { app, described } = setup()

    const response = await request(app).post('/auth/applicant').send(body)

    expect(response.status).toBe(400)
    expect(described).toEqual([])
  })

  it('accepts a name and org at the column widths', async () => {
    const { app } = setup()

    const response = await request(app)
      .post('/auth/applicant')
      .send({ handle: 'good', name: 'x'.repeat(120), org: 'y'.repeat(160) })

    expect(response.status).toBe(204)
  })
})
