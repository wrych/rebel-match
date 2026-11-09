import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { loadConfig } from '../config.js'
import { configPolicy } from '../permissions.js'
import type {
  FeedbackNote,
  FeedbackOutcome,
  FeedbackSender,
} from '../services/feedback.js'
import { feedbackRoutes } from './feedback.js'

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

function setup(outcome: FeedbackOutcome = { result: 'sent' }): {
  app: Express
  calls: [FeedbackNote, FeedbackSender][]
} {
  const calls: [FeedbackNote, FeedbackSender][] = []
  const app = express()
  app.use(express.json())
  app.use(
    feedbackRoutes({
      auth,
      config,
      feedback: {
        send: (note, from) => {
          calls.push([note, from])
          return Promise.resolve(outcome)
        },
      },
    }),
  )
  return { app, calls }
}

async function cookie(): Promise<string> {
  const session = await auth.createSession('m-ada')
  return `${session.name}=${session.value}`
}

describe('POST /api/feedback', () => {
  it('sends a member’s feedback as theirs (R-FB-1)', async () => {
    const { app, calls } = setup()

    const response = await request(app)
      .post('/api/feedback')
      .set('Cookie', await cookie())
      .send({
        message: ' Great app ',
        name: 'Ada',
        email: 'ada@example.invalid',
        screen: 'matches',
        altcha: 'ignored',
      })

    expect(response.status).toBe(204)
    expect(calls).toEqual([
      [
        {
          message: 'Great app',
          name: 'Ada',
          email: 'ada@example.invalid',
          screen: 'matches',
        },
        { memberId: 'm-ada' },
      ],
    ])
  })

  it('takes a visitor’s feedback by network, a blank name and email as none', async () => {
    const { app, calls } = setup()

    const response = await request(app)
      .post('/api/feedback')
      .send({ message: 'Hi', name: '', email: '', altcha: 'payload' })

    expect(response.status).toBe(204)
    expect(calls[0]?.[0]).toEqual({ message: 'Hi' })
    expect(calls[0]?.[1]).toMatchObject({ altcha: 'payload' })
    expect(calls[0]?.[1]).toHaveProperty('ip')
  })

  it.each([
    [{}],
    [{ message: '   ' }],
    [{ message: 'x'.repeat(config.limits.feedbackMaxChars + 1) }],
    [{ message: 'Hi', email: 'not an address' }],
    [{ message: 'Hi', screen: '/challenges/abc' }],
  ])('refuses %j without sending', async (body) => {
    const { app, calls } = setup()

    const response = await request(app).post('/api/feedback').send(body)

    expect(response.status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it('asks for the human check when the service does (R-FB-2)', async () => {
    const challenge = { parameters: {}, signature: 'sig' } as never
    const { app } = setup({ result: 'human-check', challenge })

    const response = await request(app)
      .post('/api/feedback')
      .send({ message: 'Hi' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ state: 'human-check', challenge })
  })

  it.each([
    [{ result: 'try-later' } as const, 429],
    [{ result: 'not-sent' } as const, 503],
  ])('answers %j with %i', async (outcome, status) => {
    const { app } = setup(outcome)

    const response = await request(app)
      .post('/api/feedback')
      .send({ message: 'Hi' })

    expect(response.status).toBe(status)
  })
})
