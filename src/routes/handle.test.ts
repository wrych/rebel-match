import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { loadConfig } from '../config.js'
import { configPolicy } from '../permissions.js'
import {
  handle,
  memberOf,
  notFound,
  replyFound,
  replyOutcome,
} from './handle.js'
import { requireSession } from './require-permission.js'

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

const outcomes = { saved: 201, taken: 409 } as const
const found: Record<string, { name: string }> = { t1: { name: 'Trust' } }

function app(maxChars: { value: number }): Express {
  const server = express()
  const guard = requireSession(auth)
  server.use(express.json())
  server.get('/whoami', guard, (_request, response) => {
    response.json({ id: memberOf(response).id })
  })
  server.post(
    '/echo/:id',
    guard,
    handle(
      {
        params: z.object({ id: z.string().regex(/^\w+$/) }),
        query: z.object({ n: z.coerce.number().int() }),
        body: z.object({ text: z.string() }),
      },
      ({ params, query, body, member }, response) => {
        response.json({
          id: params.id,
          n: query.n,
          text: body.text,
          member: member.id,
        })
      },
    ),
  )
  server.post(
    '/note',
    guard,
    handle(
      () => ({ body: z.object({ note: z.string().max(maxChars.value) }) }),
      ({ body }, response) => {
        response.json({ note: body.note })
      },
    ),
  )
  server.post(
    '/outcome/:outcome',
    handle(
      { params: z.object({ outcome: z.enum(['saved', 'taken']) }) },
      ({ params }, response) => {
        replyOutcome(response, outcomes, params.outcome)
      },
    ),
  )
  server.get('/found/:id', (request, response) => {
    replyFound(response, found[request.params['id']] ?? null)
  })
  server.get('/keyed/:id', (request, response) => {
    replyFound(response, found[request.params['id']] ?? null, 'trend')
  })
  server.get('/gone', (_request, response) => {
    notFound(response)
  })
  return server
}

async function cookie(): Promise<string> {
  const session = await auth.createSession('m-ada')
  return `${session.name}=${session.value}`
}

describe('memberOf', () => {
  it('names the member the guard let through', async () => {
    const response = await request(app({ value: 10 }))
      .get('/whoami')
      .set('Cookie', await cookie())

    expect(response.body).toEqual({ id: 'm-ada' })
  })
})

describe('handle', () => {
  it('calls the handler with each part as its schema outputs it, and the member', async () => {
    const response = await request(app({ value: 10 }))
      .post('/echo/abc?n=7')
      .set('Cookie', await cookie())
      .send({ text: 'hi' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      id: 'abc',
      n: 7,
      text: 'hi',
      member: 'm-ada',
    })
  })

  it.each([
    ['params', '/echo/a-b?n=7', { text: 'hi' }],
    ['query', '/echo/abc?n=seven', { text: 'hi' }],
    ['body', '/echo/abc?n=7', { text: 7 }],
  ])('answers 400 bad_request when the %s fail', async (_part, path, body) => {
    const response = await request(app({ value: 10 }))
      .post(path)
      .set('Cookie', await cookie())
      .send(body)

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'bad_request' })
  })

  it('builds schemas given as a function on each request', async () => {
    const limit = { value: 3 }
    const server = app(limit)
    const session = await cookie()

    const refused = await request(server)
      .post('/note')
      .set('Cookie', session)
      .send({ note: 'long' })
    limit.value = 10
    const accepted = await request(server)
      .post('/note')
      .set('Cookie', session)
      .send({ note: 'long' })

    expect(refused.status).toBe(400)
    expect(accepted.body).toEqual({ note: 'long' })
  })
})

describe('replyOutcome', () => {
  it.each([
    ['saved', 201],
    ['taken', 409],
  ])('answers %s with the status its table gives', async (outcome, status) => {
    const response = await request(app({ value: 10 })).post(
      `/outcome/${outcome}`,
    )

    expect(response.status).toBe(status)
    expect(response.body).toEqual({ result: outcome })
  })
})

describe('replyFound', () => {
  it('answers what was found as it is', async () => {
    const response = await request(app({ value: 10 })).get('/found/t1')

    expect(response.body).toEqual({ name: 'Trust' })
  })

  it('answers what was found under its key', async () => {
    const response = await request(app({ value: 10 })).get('/keyed/t1')

    expect(response.body).toEqual({ trend: { name: 'Trust' } })
  })

  it('answers 404 not_found when nothing was', async () => {
    const response = await request(app({ value: 10 })).get('/keyed/t2')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not_found' })
  })
})

describe('notFound', () => {
  it('answers 404 not_found', async () => {
    const response = await request(app({ value: 10 })).get('/gone')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not_found' })
  })
})
