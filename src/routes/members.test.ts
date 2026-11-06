import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { loadConfig } from '../config.js'
import { configPolicy } from '../permissions.js'
import {
  createMemberSearch,
  type MemberCard,
} from '../services/member-search.js'
import { memberRoutes } from './members.js'

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

const ben: MemberCard = {
  memberId: 'm-ben',
  name: 'Ben Okafor',
  jobTitle: 'Coach',
  org: 'Acme',
  sector: 'Retail',
  companySize: '1–10 employees',
  connectionId: null,
}

function setup(memberSearch = 1): Express {
  const service = createMemberSearch({
    rules: () => ({ searchOn: memberSearch === 1, minChars: 2, maxResults: 5 }),
    store: {
      search: () => Promise.resolve([ben]),
      card: (_viewerId, id) =>
        Promise.resolve(
          id === 'm-ben'
            ? { card: ben, reachable: true, findable: true }
            : null,
        ),
    },
  })
  const app = express()
  const settings = { limits: () => ({ ...config.limits, memberSearch }) }
  app.use(memberRoutes({ auth, settings, memberSearch: service }))
  return app
}

async function cookieFor(memberId: string): Promise<string> {
  const session = await auth.createSession(memberId)
  return `${session.name}=${session.value}`
}

describe('member search routes (R-FIND-1, R-FIND-3, R-FIND-6)', () => {
  it('answers a query with member cards, no email', async () => {
    const response = await request(setup())
      .get('/api/members/search?q=ben')
      .set('Cookie', await cookieFor('m-ada'))

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ results: [ben], more: false })
    expect(JSON.stringify(response.body)).not.toContain('@')
  })

  it('says a query is too short rather than searching it', async () => {
    const response = await request(setup())
      .get('/api/members/search?q=b')
      .set('Cookie', await cookieFor('m-ada'))

    expect(response.body).toEqual({
      results: [],
      more: false,
      tooShort: true,
    })
  })

  it('opens a card reach allows, and nothing else', async () => {
    const cookie = await cookieFor('m-ada')
    const found = await request(setup())
      .get('/api/members/m-ben/card')
      .set('Cookie', cookie)
    const missing = await request(setup())
      .get('/api/members/m-zed/card')
      .set('Cookie', cookie)

    expect(found.body).toEqual({ card: ben })
    expect(missing.status).toBe(404)
  })

  it.each(['/api/members/search?q=ben', '/api/members/m-ben/card'])(
    'answers %s as not found while search is off',
    async (path) => {
      const response = await request(setup(0))
        .get(path)
        .set('Cookie', await cookieFor('m-ada'))

      expect(response.status).toBe(404)
    },
  )

  it('is not found without member:search (R-ROLE-3)', async () => {
    const response = await request(setup())
      .get('/api/members/search?q=ben')
      .set('Cookie', await cookieFor('m-none'))

    expect(response.status).toBe(404)
  })
})
