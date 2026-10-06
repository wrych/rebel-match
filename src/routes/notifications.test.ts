import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { loadConfig } from '../config.js'
import { configPolicy } from '../permissions.js'
import type {
  NotificationService,
  NotificationView,
} from '../services/notifications.js'
import { notificationRoutes } from './notifications.js'

const config = loadConfig({
  DATABASE_URL: 'postgres://user:pw@localhost:5432/rebel_match',
  SESSION_SECRET: 'x'.repeat(32),
  NOTIFICATIONS_PAGE_SIZE: '2',
})
const auth = createAuth({
  store: createMemoryAuthStore([
    { id: 'm-ada', email: 'a@example.invalid', roles: ['member'] },
    { id: 'm-host', email: 'h@example.invalid', roles: ['member', 'admin'] },
  ]),
  policy: configPolicy,
  deliver: () => Promise.resolve(),
  config,
})
const entry: NotificationView = {
  id: 'n1',
  kind: 'connection_request',
  at: '2026-10-06T08:00:00.000Z',
  isNew: true,
  name: 'Bea There',
  path: '/matches/requests/r1',
}

function setup(): { app: Express; calls: unknown[] } {
  const calls: unknown[] = []
  const notifications = {
    list: (memberId: string, before: string | null) => {
      calls.push(['list', memberId, before])
      return Promise.resolve([entry])
    },
    newCount: (memberId: string) => {
      calls.push(['new', memberId])
      return Promise.resolve(4)
    },
    seen: (memberId: string, ids: readonly string[]) => {
      calls.push(['seen', memberId, ids])
      return Promise.resolve()
    },
  } as unknown as NotificationService
  const app = express()
  app.use(express.json())
  app.use(
    notificationRoutes({
      auth,
      notifications,
      notificationSettings: {
        list: (memberId, canReview) => {
          calls.push(['settings', memberId, canReview])
          return Promise.resolve([])
        },
        choose: (memberId, canReview, type, cadence) => {
          calls.push(['choose', memberId, canReview, type, cadence])
          return Promise.resolve(
            type === 'nope'
              ? 'not_found'
              : cadence === 'weekly'
                ? 'not_offered'
                : 'done',
          )
        },
      },
      settings: { limits: () => config.limits },
    }),
  )
  app.use(
    (
      _error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      response.status(400).end()
    },
  )
  return { app, calls }
}

async function cookie(): Promise<string> {
  const session = await auth.createSession('m-ada')
  return `${session.name}=${session.value}`
}

describe('notification routes', () => {
  it('lists the member’s own, after an entry when asked (R-NOTE-5)', async () => {
    const { app, calls } = setup()

    const first = await request(app)
      .get('/api/notifications')
      .set('Cookie', await cookie())
    await request(app)
      .get('/api/notifications?before=n9')
      .set('Cookie', await cookie())

    expect(first.body).toEqual({ notifications: [entry] })
    expect(calls).toEqual([
      ['list', 'm-ada', null],
      ['list', 'm-ada', 'n9'],
    ])
  })

  it('refuses a cursor that is no id', async () => {
    const response = await request(setup().app)
      .get(`/api/notifications?before=${'x'.repeat(37)}`)
      .set('Cookie', await cookie())

    expect(response.status).toBe(400)
  })

  it('counts the new ones, for the menu (R-NOTE-6)', async () => {
    const response = await request(setup().app)
      .get('/api/notifications/new')
      .set('Cookie', await cookie())

    expect(response.body).toEqual({ count: 4 })
  })

  it('marks what the screen listed as seen, a page at most (R-NOTE-5)', async () => {
    const { app, calls } = setup()

    await request(app)
      .post('/api/notifications/seen')
      .set('Cookie', await cookie())
      .send({ ids: ['n1', 'n2'] })
      .expect(204)
    const tooMany = await request(app)
      .post('/api/notifications/seen')
      .set('Cookie', await cookie())
      .send({ ids: ['n1', 'n2', 'n3'] })

    expect(tooMany.status).toBe(400)
    expect(calls).toEqual([['seen', 'm-ada', ['n1', 'n2']]])
  })

  it('lists the member’s choices, applicants only for a reviewer (R-NOTE-3)', async () => {
    const { app, calls } = setup()

    await request(app)
      .get('/api/me/notification-settings')
      .set('Cookie', await cookie())
      .expect(200)
    const host = await auth.createSession('m-host')
    await request(app)
      .get('/api/me/notification-settings')
      .set('Cookie', `${host.name}=${host.value}`)
      .expect(200)

    expect(calls).toEqual([
      ['settings', 'm-ada', false],
      ['settings', 'm-host', true],
    ])
  })

  it.each([
    ['connection_request', 'daily', 204],
    ['nope', 'daily', 404],
    ['connection_request', 'weekly', 400],
  ])('chooses %s %s with %i (R-NOTE-2)', async (type, cadence, status) => {
    const response = await request(setup().app)
      .put(`/api/me/notification-settings/${type}`)
      .set('Cookie', await cookie())
      .send({ cadence })

    expect(response.status).toBe(status)
  })

  it('asks for a session', async () => {
    const { app } = setup()

    expect((await request(app).get('/api/notifications')).status).toBe(401)
    expect((await request(app).get('/api/notifications/new')).status).toBe(401)
    expect(
      (await request(app).post('/api/notifications/seen').send({ ids: [] }))
        .status,
    ).toBe(401)
  })
})
