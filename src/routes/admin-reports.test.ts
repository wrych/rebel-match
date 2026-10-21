import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { loadConfig } from '../config.js'
import { configPolicy } from '../permissions.js'
import type {
  ModerationPage,
  ModerationService,
  ReportedMember,
} from '../services/moderation.js'
import { adminReportRoutes } from './admin-reports.js'

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
const rik: ReportedMember = {
  memberId: 'm-rik',
  name: 'Rik Dalton',
  email: 'rik@example.invalid',
  org: 'Peakflow',
  status: 'active',
  reports: 4,
  reporters: 4,
  challenges: 1,
  notes: 1,
  reasons: [{ reason: 'spam', count: 4 }],
  latestAt: '2026-11-08T10:00:00.000Z',
}
const page: ModerationPage = {
  member: {
    id: 'm-rik',
    name: 'Rik Dalton',
    email: 'rik@example.invalid',
    org: 'Peakflow',
    status: 'active',
    joinedAt: '2026-11-08T09:00:00.000Z',
  },
  open: { reports: 4, reporters: 4 },
  items: [],
  history: [],
}

function setup(): { app: Express; calls: unknown[][] } {
  const calls: unknown[][] = []
  const moderation: ModerationService = {
    overview: (state) => {
      calls.push(['overview', state])
      return Promise.resolve([rik])
    },
    openMembers: () => Promise.resolve(3),
    page: (memberId) => Promise.resolve(memberId === 'm-rik' ? page : null),
    hideNote: (id, actorId, reason) => {
      calls.push(['hideNote', id, actorId, reason])
      return Promise.resolve(id === 'r-1' ? 'hidden' : 'not_found')
    },
    unhideNote: (id, actorId) => {
      calls.push(['unhideNote', id, actorId])
      return Promise.resolve(id === 'r-1' ? 'shown' : 'not_found')
    },
    dismiss: (item, actorId) => {
      calls.push(['dismiss', item, actorId])
      return Promise.resolve(
        'requestId' in item && item.requestId === 'r-1'
          ? 'dismissed'
          : 'not_found',
      )
    },
  }
  const app = express()
  app.use(express.json())
  app.use(
    adminReportRoutes({
      auth,
      moderation,
      notifications: {
        openedReports: (memberId, reportedId) => {
          calls.push(['opened', memberId, reportedId])
          return Promise.resolve()
        },
      },
    }),
  )
  return { app, calls }
}

async function cookieFor(memberId: string): Promise<string> {
  const cookie = await auth.createSession(memberId)
  return `${cookie.name}=${cookie.value}`
}

describe('admin report routes (F21)', () => {
  it('lists reported members, open unless asked for handled (R-MOD-6)', async () => {
    const { app, calls } = setup()
    const cookie = await cookieFor('m-admin')

    const open = await request(app)
      .get('/api/admin/reports')
      .set('Cookie', cookie)
    await request(app)
      .get('/api/admin/reports?state=handled')
      .set('Cookie', cookie)
    const odd = await request(app)
      .get('/api/admin/reports?state=all')
      .set('Cookie', cookie)

    expect(open.body).toEqual({ members: [rik] })
    expect(odd.status).toBe(400)
    expect(calls).toEqual([
      ['overview', 'open'],
      ['overview', 'handled'],
    ])
  })

  it('shows one member’s page, and 404 for no such member (R-MOD-7)', async () => {
    const { app } = setup()
    const cookie = await cookieFor('m-admin')

    const found = await request(app)
      .get('/api/admin/reports/m-rik')
      .set('Cookie', cookie)
    const missing = await request(app)
      .get('/api/admin/reports/m-nobody')
      .set('Cookie', cookie)

    expect(found.body).toEqual(page)
    expect(missing.status).toBe(404)
  })

  it('counts the members with open reports, for the menu (R-MOD-5)', async () => {
    const { app, calls } = setup()

    const response = await request(app)
      .get('/api/admin/reports/count')
      .set('Cookie', await cookieFor('m-admin'))

    expect(response.body).toEqual({ members: 3 })
    expect(calls).toEqual([])
  })

  it.each([
    [{ requestId: 'r-1' }, 204],
    [{ challengeId: 'c-9' }, 404],
    [{ challengeId: 'c-1', requestId: 'r-1' }, 400],
    [{}, 400],
  ])('dismisses %o with %i, recording the host', async (body, status) => {
    const { app, calls } = setup()

    const response = await request(app)
      .post('/api/admin/reports/dismiss')
      .set('Cookie', await cookieFor('m-admin'))
      .send(body)

    expect(response.status).toBe(status)
    if (status !== 400) expect(calls).toEqual([['dismiss', body, 'm-admin']])
  })

  it.each([
    ['hide-note', { reason: 'spam' }, 'r-1', 204],
    ['hide-note', { reason: 'spam' }, 'r-9', 404],
    ['hide-note', { reason: 'boring' }, 'r-1', 400],
    ['unhide-note', {}, 'r-1', 204],
    ['unhide-note', {}, 'r-9', 404],
  ])(
    'answers %s of %o on %s with %i (R-MOD-8)',
    async (action, body, id, status) => {
      const response = await request(setup().app)
        .post(`/api/admin/requests/${id}/${action}`)
        .set('Cookie', await cookieFor('m-admin'))
        .send(body)

      expect(response.status).toBe(status)
    },
  )

  it('records the host who hides a note, with the reason', async () => {
    const { app, calls } = setup()

    await request(app)
      .post('/api/admin/requests/r-1/hide-note')
      .set('Cookie', await cookieFor('m-admin'))
      .send({ reason: 'inappropriate' })

    expect(calls).toEqual([['hideNote', 'r-1', 'm-admin', 'inappropriate']])
  })

  it('lets nobody without challenge:moderate hide or unhide a note (R-ROLE-3)', async () => {
    const { app, calls } = setup()
    const cookie = await cookieFor('m-member')

    const hide = await request(app)
      .post('/api/admin/requests/r-1/hide-note')
      .set('Cookie', cookie)
      .send({ reason: 'spam' })
    const unhide = await request(app)
      .post('/api/admin/requests/r-1/unhide-note')
      .set('Cookie', cookie)

    expect([hide.status, unhide.status]).toEqual([404, 404])
    expect(calls).toEqual([])
  })

  it('shows a member without report:review nothing (R-MOD-12, R-NAV-8)', async () => {
    const { app, calls } = setup()
    const cookie = await cookieFor('m-member')

    const statuses = await Promise.all([
      request(app).get('/api/admin/reports').set('Cookie', cookie),
      request(app).get('/api/admin/reports/m-rik').set('Cookie', cookie),
      request(app).get('/api/admin/reports/count').set('Cookie', cookie),
      request(app)
        .post('/api/admin/reports/dismiss')
        .set('Cookie', cookie)
        .send({ requestId: 'r-1' }),
    ])

    expect(statuses.map((each) => each.status)).toEqual([404, 404, 404, 404])
    expect(calls).toEqual([])
  })
})
