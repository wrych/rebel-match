import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { loadConfig } from '../config.js'
import { configPolicy } from '../permissions.js'
import { createDeck, type DeckCard } from '../services/deck.js'
import { deckRoutes } from './deck.js'

const config = loadConfig({
  DATABASE_URL: 'mysql://user:pw@localhost:3306/rebel_match',
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
const card: DeckCard = {
  challengeId: 'c-1',
  body: 'Nobody knows who can decide what.',
  trend: { id: '06', short: 'Distributed Decision Making' },
  author: {
    name: 'Sanne Kuipers',
    jobTitle: 'Ops lead',
    org: 'Vaartlicht',
    sector: 'Healthcare · 1,200',
  },
}

function setup(): { app: Express; asked: [string, number][] } {
  const asked: [string, number][] = []
  const deck = createDeck({
    pageSize: 7,
    store: {
      nextFor: (viewerId, limit) => {
        asked.push([viewerId, limit])
        return Promise.resolve([card])
      },
    },
  })
  const app = express()
  app.use(deckRoutes({ auth, deck }))
  return { app, asked }
}

async function cookieFor(memberId: string): Promise<string> {
  const session = await auth.createSession(memberId)
  return `${session.name}=${session.value}`
}

describe('GET /api/deck', () => {
  it('deals the next page of cards for the signed-in member (R-OFF-1,2)', async () => {
    const { app, asked } = setup()

    const response = await request(app)
      .get('/api/deck')
      .set('Cookie', await cookieFor('m-ada'))

    expect(response.body).toEqual({ cards: [card] })
    expect(asked).toEqual([['m-ada', 7]])
  })

  it('hides the deck from a member without challenge:swipe (R-ROLE-3)', async () => {
    const { app, asked } = setup()

    const response = await request(app)
      .get('/api/deck')
      .set('Cookie', await cookieFor('m-none'))

    expect(response.status).toBe(404)
    expect(asked).toEqual([])
  })
})
