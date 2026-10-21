import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { fixedSettings, loadConfig } from '../config.js'
import { configPolicy } from '../permissions.js'
import type {
  ReportOutcome,
  ReportService,
  ReportTarget,
} from '../services/reports.js'
import { reportRoutes } from './reports.js'

const config = loadConfig({
  DATABASE_URL: 'postgres://user:pw@localhost:5432/rebel_match',
  SESSION_SECRET: 'x'.repeat(32),
})
const auth = createAuth({
  store: createMemoryAuthStore([
    { id: 'm-ada', email: 'a@example.invalid', roles: ['member'] },
    { id: 'm-new', email: 'n@example.invalid', roles: [] },
  ]),
  policy: configPolicy,
  deliver: () => Promise.resolve(),
  config,
})
const target: ReportTarget = {
  kind: 'note',
  body: 'Use code REBEL50.',
  trendShort: null,
  alreadyReported: false,
}

function setup(outcome: ReportOutcome = 'reported'): {
  app: Express
  calls: unknown[][]
} {
  const calls: unknown[][] = []
  const reports: ReportService = {
    target: (reporterId, item) => {
      calls.push(['target', reporterId, item])
      return Promise.resolve('requestId' in item ? target : null)
    },
    report: (reporterId, input) => {
      calls.push(['report', reporterId, input])
      return Promise.resolve(outcome)
    },
  }
  const app = express()
  app.use(express.json())
  app.use(reportRoutes({ auth, reports, settings: fixedSettings(config) }))
  return { app, calls }
}

async function cookieFor(memberId: string): Promise<string> {
  const cookie = await auth.createSession(memberId)
  return `${cookie.name}=${cookie.value}`
}

describe('report routes (F20)', () => {
  it('shows what is being reported, and 404 for what the member may not report (R-NAV-8)', async () => {
    const { app, calls } = setup()
    const cookie = await cookieFor('m-ada')

    const note = await request(app)
      .get('/api/reports/request/r-1')
      .set('Cookie', cookie)
    const challenge = await request(app)
      .get('/api/reports/challenge/c-1')
      .set('Cookie', cookie)

    expect(note.body).toEqual({ target })
    expect(challenge.status).toBe(404)
    expect(calls).toEqual([
      ['target', 'm-ada', { requestId: 'r-1' }],
      ['target', 'm-ada', { challengeId: 'c-1' }],
    ])
  })

  it('records a report, its comment trimmed and an empty one left out (R-MOD-3)', async () => {
    const { app, calls } = setup()
    const cookie = await cookieFor('m-ada')

    const first = await request(app)
      .post('/api/reports')
      .set('Cookie', cookie)
      .send({ challengeId: 'c-1', reason: 'spam', comment: '  Pitching.  ' })
    await request(app)
      .post('/api/reports')
      .set('Cookie', cookie)
      .send({ requestId: 'r-1', reason: 'other', comment: '   ' })

    expect(first.status).toBe(204)
    expect(calls).toEqual([
      [
        'report',
        'm-ada',
        { item: { challengeId: 'c-1' }, reason: 'spam', comment: 'Pitching.' },
      ],
      [
        'report',
        'm-ada',
        { item: { requestId: 'r-1' }, reason: 'other', comment: null },
      ],
    ])
  })

  it.each([
    [{ reason: 'spam' }],
    [{ challengeId: 'c-1', requestId: 'r-1', reason: 'spam' }],
    [{ challengeId: 'c-1', reason: 'boring' }],
    [{ challengeId: 'c-1', reason: 'spam', comment: 'x'.repeat(501) }],
  ])('refuses %o', async (body) => {
    const { app, calls } = setup()

    const response = await request(app)
      .post('/api/reports')
      .set('Cookie', await cookieFor('m-ada'))
      .send(body)

    expect(response.status).toBe(400)
    expect(calls).toEqual([])
  })

  it.each<[ReportOutcome, number]>([
    ['not_found', 404],
    ['already_reported', 409],
    ['too_many', 429],
  ])('answers %s with %i (R-MOD-4)', async (outcome, status) => {
    const response = await request(setup(outcome).app)
      .post('/api/reports')
      .set('Cookie', await cookieFor('m-ada'))
      .send({ challengeId: 'c-1', reason: 'spam' })

    expect(response.status).toBe(status)
  })

  it('lets nobody without content:report report or read (R-MOD-12)', async () => {
    const { app, calls } = setup()
    const cookie = await cookieFor('m-new')

    const read = await request(app)
      .get('/api/reports/request/r-1')
      .set('Cookie', cookie)
    const sent = await request(app)
      .post('/api/reports')
      .set('Cookie', cookie)
      .send({ challengeId: 'c-1', reason: 'spam' })

    expect([read.status, sent.status]).toEqual([404, 404])
    expect(calls).toEqual([])
  })
})
