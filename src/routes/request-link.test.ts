import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import type { LinkRequestState } from '../services/admission.js'
import { requestLinkRoutes } from './request-link.js'

function setup(state: LinkRequestState = 'check-email'): {
  app: Express
  calls: { email: string; next: string | undefined }[]
} {
  const calls: { email: string; next: string | undefined }[] = []
  const app = express()
  app.use(express.json())
  app.use(
    requestLinkRoutes({
      admission: {
        requestLink: (email, next) => {
          calls.push({ email, next })
          return Promise.resolve(state)
        },
      },
    }),
  )
  return { app, calls }
}

describe('POST /auth/request-link', () => {
  it.each(['check-email', 'access-requested', 'not-approved'] as const)(
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
