import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { loadConfig } from '../config.js'
import { configPolicy } from '../permissions.js'
import type {
  ConnectionService,
  ConnectionView,
  NewConnection,
} from '../services/connections.js'
import { connectionRoutes } from './connections.js'

const config = loadConfig({
  DATABASE_URL: 'postgres://user:pw@localhost:5432/rebel_match',
  SESSION_SECRET: 'x'.repeat(32),
})
const auth = createAuth({
  store: createMemoryAuthStore([
    { id: 'm-ada', email: 'a@example.invalid', roles: ['member'] },
    { id: 'm-none', email: 'n@example.invalid', roles: [] },
  ]),
  policy: configPolicy,
  deliver: () => Promise.resolve(),
  config,
})

function setup(): { app: Express; requests: NewConnection[] } {
  const requests: NewConnection[] = []
  const connections: ConnectionService = {
    request: (_requester, input) => {
      requests.push(input)
      if (input.targetId === 'm-dup') {
        return Promise.resolve({ result: 'exists', id: 'r-old' })
      }
      if (input.targetId === 'm-friend') {
        return Promise.resolve({ result: 'joined', id: 'r-new' })
      }
      if (input.targetId === 'm-ghost') {
        return Promise.resolve({ result: 'not_found' })
      }
      return Promise.resolve({ result: 'created', id: 'r-1' })
    },
    incoming: () => Promise.resolve([]),
    connected: (memberId) =>
      Promise.resolve(
        memberId === 'm-ada' ? [{ id: 'r-1' } as ConnectionView] : [],
      ),
    get: (_m, id) => Promise.resolve(id === 'r-1' ? ({ id } as never) : null),
    respond: (_m, id) => Promise.resolve(id === 'r-1' ? 'done' : 'not_found'),
    contact: (_m, id) =>
      Promise.resolve(
        id === 'r-1'
          ? {
              name: 'Bob',
              email: 'bob@example.invalid',
              mailto: 'mailto:x',
              over: [],
            }
          : null,
      ),
  }
  const app = express()
  app.use(express.json())
  app.use(connectionRoutes({ auth, connections, config }))
  return { app, requests }
}

async function cookieFor(memberId: string): Promise<string> {
  const session = await auth.createSession(memberId)
  return `${session.name}=${session.value}`
}

describe('connection routes', () => {
  it('creates a request, trimming the note (R-CONN-1)', async () => {
    const { app, requests } = setup()

    const response = await request(app)
      .post('/api/connections')
      .set('Cookie', await cookieFor('m-ada'))
      .send({
        targetId: 'm-bob',
        kind: 'been_there',
        message: '  Happy to share.  ',
      })

    expect(response.status).toBe(201)
    expect(response.body).toEqual({ result: 'created', id: 'r-1' })
    expect(requests).toEqual([
      { targetId: 'm-bob', kind: 'been_there', message: 'Happy to share.' },
    ])
  })

  it('answers a duplicate with 409 and the existing request (R-CONN-5)', async () => {
    const response = await request(setup().app)
      .post('/api/connections')
      .set('Cookie', await cookieFor('m-ada'))
      .send({ targetId: 'm-dup', kind: 'same_boat' })

    expect(response.status).toBe(409)
    expect(response.body).toEqual({ result: 'exists', id: 'r-old' })
  })

  it('answers a connection added between members already connected with 200 (R-CONN-8)', async () => {
    const response = await request(setup().app)
      .post('/api/connections')
      .set('Cookie', await cookieFor('m-ada'))
      .send({ targetId: 'm-friend', kind: 'same_boat' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ result: 'joined', id: 'r-new' })
  })

  it.each([
    [{ targetId: 'm-bob', kind: 'hello' }, 400],
    [{ kind: 'same_boat' }, 400],
    [{ targetId: 'm-bob', kind: 'same_boat', message: 'x'.repeat(601) }, 400],
    [{ targetId: 'm-ghost', kind: 'same_boat' }, 404],
  ])('refuses %j with %i', async (body, status) => {
    const response = await request(setup().app)
      .post('/api/connections')
      .set('Cookie', await cookieFor('m-ada'))
      .send(body)

    expect(response.status).toBe(status)
  })

  it.each([
    ['get', '/api/connections/r-9'],
    ['get', '/api/connections/r-9/contact'],
    ['post', '/api/connections/r-9/accept'],
    ['post', '/api/connections/r-9/decline'],
  ] as const)(
    'answers %s %s with 404, never 403, when it is not theirs (R-NAV-8, ADR 0004)',
    async (method, path) => {
      const response = await request(setup().app)
        [method](path)
        .set('Cookie', await cookieFor('m-ada'))

      expect(response.status).toBe(404)
    },
  )

  it('lists the caller’s own connections, not the path of one request (R-MINE-5)', async () => {
    const response = await request(setup().app)
      .get('/api/connections/connected')
      .set('Cookie', await cookieFor('m-ada'))

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ connections: [{ id: 'r-1' }] })
  })

  it('returns the contact when the service allows it (R-CONN-3)', async () => {
    const response = await request(setup().app)
      .get('/api/connections/r-1/contact')
      .set('Cookie', await cookieFor('m-ada'))

    expect(response.body).toEqual({
      contact: {
        name: 'Bob',
        email: 'bob@example.invalid',
        mailto: 'mailto:x',
        over: [],
      },
    })
  })

  it('hides every connection route from a member without connection:request', async () => {
    const response = await request(setup().app)
      .get('/api/connections/incoming')
      .set('Cookie', await cookieFor('m-none'))

    expect(response.status).toBe(404)
  })
})
