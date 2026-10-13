import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { loadConfig } from '../config.js'
import { assign } from '../flags.js'
import { configPolicy } from '../permissions.js'
import { flagRoutes } from './flags.js'

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

function setup(share: { value: number }): Express {
  const app = express()
  app.use(
    flagRoutes({
      auth,
      settings: { flags: () => ({ matches_layout: share.value }) },
    }),
  )
  return app
}

async function cookie(): Promise<string> {
  const session = await auth.createSession('m-ada')
  return `${session.name}=${session.value}`
}

describe('GET /api/flags', () => {
  it('answers the caller’s variants, as assigned from their id (R-EXP-1)', async () => {
    const response = await request(setup({ value: 50 }))
      .get('/api/flags')
      .set('Cookie', await cookie())

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      flags: assign('m-ada', { matches_layout: 50 }),
    })
  })

  it('follows a share a host changed, without a restart (R-EXP-3)', async () => {
    const share = { value: 0 }
    const app = setup(share)
    const read = async (): Promise<unknown> =>
      (
        await request(app)
          .get('/api/flags')
          .set('Cookie', await cookie())
      ).body

    expect(await read()).toEqual({ flags: { matches_layout: 'cards' } })
    share.value = 100
    expect(await read()).toEqual({ flags: { matches_layout: 'summary' } })
  })

  it('asks for a session', async () => {
    const response = await request(setup({ value: 50 })).get('/api/flags')

    expect(response.status).toBe(401)
  })
})
