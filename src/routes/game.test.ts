import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { handleErrors } from '../app.js'
import { loadConfig } from '../config.js'
import { gameDefaults, type GameSettings } from '../game/tuning.js'
import { configPolicy } from '../permissions.js'
import { createGame } from '../services/game.js'
import { createMemoryGameStore } from '../services/game-memory-store.js'
import { gameRoutes } from './game.js'

const config = loadConfig({
  DATABASE_URL: 'postgres://user:pw@localhost:5432/rebel_match',
  SESSION_SECRET: 'x'.repeat(32),
  GAME_RECORDS_PER_MINUTE: '2',
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

function setup(enabled = 1): {
  app: Express
  store: ReturnType<typeof createMemoryGameStore>
} {
  const settings: GameSettings = { ...gameDefaults, enabled }
  const store = createMemoryGameStore()
  const game = createGame({
    store,
    settings: () => settings,
    allowance: config.gameDayAllowance,
    newId: () => 'd-1',
  })
  const app = express()
  app.use(express.json())
  app.use(
    gameRoutes({
      auth,
      config,
      game,
      settings: {
        limits: () => config.limits,
        abuse: () => config.abuse,
        game: () => settings,
      },
    }),
  )
  app.use(handleErrors)
  return { app, store }
}

async function cookieFor(memberId: string): Promise<string> {
  const session = await auth.createSession(memberId)
  return `${session.name}=${session.value}`
}

const won = { level: 1, outcome: 'won', playSeconds: 80 }

describe('the game API (R-GAME-1, R-GAME-14..17, R-GAME-20)', () => {
  it('answers not found for every address while the game is off', async () => {
    const { app, store } = setup(0)
    const cookie = await cookieFor('m-ada')

    const answers = await Promise.all([
      request(app).get('/api/game').set('Cookie', cookie),
      request(app).post('/api/game/days').set('Cookie', cookie).send(won),
      request(app)
        .put('/api/game/sharing')
        .set('Cookie', cookie)
        .send({ shared: true }),
      request(app).put('/api/game/hints/firstDay').set('Cookie', cookie),
    ])

    expect(answers.map((answer) => answer.status)).toEqual([404, 404, 404, 404])
    expect(store.players.size).toBe(0)
  })

  it('hides the game from a member without game:play (R-ROLE-3)', async () => {
    const { app } = setup()

    const response = await request(app)
      .get('/api/game')
      .set('Cookie', await cookieFor('m-none'))

    expect(response.status).toBe(404)
  })

  it('gives the player their state', async () => {
    const { app } = setup()

    const response = await request(app)
      .get('/api/game')
      .set('Cookie', await cookieFor('m-ada'))

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ resumeLevel: 1, best: null })
  })

  it('records a day and answers with the new best and place', async () => {
    const { app, store } = setup()

    const response = await request(app)
      .post('/api/game/days')
      .set('Cookie', await cookieFor('m-ada'))
      .send(won)

    expect(response.body).toMatchObject({
      newBest: true,
      place: { position: 1, of: 1 },
    })
    expect(store.days).toHaveLength(1)
  })

  it('refuses a malformed day, and one that cannot have been played', async () => {
    const { app, store } = setup()
    const cookie = await cookieFor('m-ada')

    const malformed = await request(app)
      .post('/api/game/days')
      .set('Cookie', cookie)
      .send({ ...won, outcome: 'cheated' })
    const implausible = await request(app)
      .post('/api/game/days')
      .set('Cookie', cookie)
      .send({ ...won, level: 12 })

    expect(malformed.status).toBe(400)
    expect(implausible.status).toBe(422)
    expect(store.days).toEqual([])
  })

  it('limits the days one member records per minute', async () => {
    const { app } = setup()
    const cookie = await cookieFor('m-ada')
    const send = (): request.Test =>
      request(app).post('/api/game/days').set('Cookie', cookie).send(won)

    const statuses = [
      (await send()).status,
      (await send()).status,
      (await send()).status,
    ]

    expect(statuses).toEqual([200, 200, 429])
  })

  it('shares the name, and records a known hint', async () => {
    const { app, store } = setup()
    const cookie = await cookieFor('m-ada')

    const shared = await request(app)
      .put('/api/game/sharing')
      .set('Cookie', cookie)
      .send({ shared: true })
    const hint = await request(app)
      .put('/api/game/hints/cooler')
      .set('Cookie', cookie)
    const unknown = await request(app)
      .put('/api/game/hints/secret')
      .set('Cookie', cookie)
    const bad = await request(app)
      .put('/api/game/sharing')
      .set('Cookie', cookie)
      .send({ shared: 'yes' })

    expect([shared.status, hint.status, unknown.status, bad.status]).toEqual([
      204, 204, 404, 400,
    ])
    expect(store.players.get('m-ada')).toMatchObject({
      shared: true,
      hintsSeen: ['cooler'],
    })
  })
})
