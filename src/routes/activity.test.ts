import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { loadConfig } from '../config.js'
import { configPolicy } from '../permissions.js'
import type { ActivityService } from '../services/activity.js'
import { activityRoutes } from './activity.js'

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

function setup(): {
  app: Express
  viewed: [string, string][]
  forgotten: string[]
} {
  const viewed: [string, string][] = []
  const forgotten: string[] = []
  const activity: ActivityService = {
    viewed: (memberId, challengeId) => {
      viewed.push([memberId, challengeId])
      return Promise.resolve(
        challengeId === 'c-gone' ? 'not_found' : 'recorded',
      )
    },
    forgetHistory: (memberId) => {
      forgotten.push(memberId)
      return Promise.resolve()
    },
  }
  const app = express()
  app.use(express.json())
  app.use(activityRoutes({ auth, activity }))
  return { app, viewed, forgotten }
}

async function cookieFor(memberId: string): Promise<string> {
  const session = await auth.createSession(memberId)
  return `${session.name}=${session.value}`
}

describe('POST /api/deck/seen', () => {
  it('records the view for the signed-in member and answers nothing (R-STAT-1,2)', async () => {
    const { app, viewed } = setup()

    const response = await request(app)
      .post('/api/deck/seen')
      .set('Cookie', await cookieFor('m-ada'))
      .send({ challengeId: 'c-1' })

    expect(response.status).toBe(204)
    expect(response.text).toBe('')
    expect(viewed).toEqual([['m-ada', 'c-1']])
  })

  it('answers 404 for a card the deck could not have shown', async () => {
    const { app } = setup()

    const response = await request(app)
      .post('/api/deck/seen')
      .set('Cookie', await cookieFor('m-ada'))
      .send({ challengeId: 'c-gone' })

    expect(response.status).toBe(404)
  })

  it.each([[{}], [{ challengeId: '' }], [{ challengeId: 42 }]])(
    'refuses %j',
    async (body) => {
      const { app, viewed } = setup()

      const response = await request(app)
        .post('/api/deck/seen')
        .set('Cookie', await cookieFor('m-ada'))
        .send(body)

      expect(response.status).toBe(400)
      expect(viewed).toEqual([])
    },
  )

  it('needs the swipe permission, like the deck itself', async () => {
    const { app, viewed } = setup()

    const nobody = await request(app)
      .post('/api/deck/seen')
      .send({ challengeId: 'c-1' })
    const noRole = await request(app)
      .post('/api/deck/seen')
      .set('Cookie', await cookieFor('m-none'))
      .send({ challengeId: 'c-1' })

    expect(nobody.status).toBe(401)
    expect(noRole.status).toBe(404)
    expect(viewed).toEqual([])
  })
})

describe('DELETE /api/me/history', () => {
  it("clears the signed-in member's own history (R-STAT-4)", async () => {
    const { app, forgotten } = setup()

    const response = await request(app)
      .delete('/api/me/history')
      .set('Cookie', await cookieFor('m-ada'))

    expect(response.status).toBe(204)
    expect(forgotten).toEqual(['m-ada'])
  })

  it('is refused to nobody', async () => {
    const { app, forgotten } = setup()

    const response = await request(app).delete('/api/me/history')

    expect(response.status).toBe(401)
    expect(forgotten).toEqual([])
  })
})
