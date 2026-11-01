import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { loadConfig } from '../config.js'
import { configPolicy } from '../permissions.js'
import { createPresentation } from '../services/presentation.js'
import { presentationRoutes } from './presentation.js'

const config = loadConfig({
  DATABASE_URL: 'postgres://user:pw@localhost:5432/rebel_match',
  SESSION_SECRET: 'x'.repeat(32),
})
const auth = createAuth({
  store: createMemoryAuthStore([
    { id: 'm-host', email: 'h@example.invalid', roles: ['member', 'admin'] },
    { id: 'm-ada', email: 'a@example.invalid', roles: ['member'] },
  ]),
  policy: configPolicy,
  deliver: () => Promise.resolve(),
  config,
})

const day = (d: string): Date => new Date(`2026-10-${d}T09:00:00Z`)

function setup(): Express {
  const presentation = createPresentation({
    store: {
      facts: () =>
        Promise.resolve({
          members: [
            { id: 'm-ben', joinedAt: day('01') },
            { id: 'm-cleo', joinedAt: day('02') },
          ],
          connections: [{ a: 'm-ben', b: 'm-cleo', formedAt: day('03') }],
          challenges: [],
        }),
      idsByEmail: (emails) =>
        Promise.resolve(
          new Map(
            emails.includes('cleo@example.invalid')
              ? [['cleo@example.invalid', 'm-cleo']]
              : [],
          ),
        ),
    },
    cast: [
      {
        handle: 'pioneer',
        name: 'Cleo',
        email: 'cleo@example.invalid',
        groups: ['pioneers'],
      },
      { handle: 'founder-one', name: 'Founder one', groups: [] },
    ],
  })
  const app = express()
  app.use(presentationRoutes({ auth, presentation }))
  return app
}

async function cookieFor(memberId: string): Promise<string> {
  const session = await auth.createSession(memberId)
  return `${session.name}=${session.value}`
}

describe('presentation routes (R-PRES-1, R-PRES-6)', () => {
  it('gives a host the whole network, nobody marked, and the cast by position', async () => {
    const response = await request(setup())
      .get('/api/admin/presentation')
      .set('Cookie', await cookieFor('m-host'))
    const body = response.body as {
      timeline: { nodes: { self: boolean }[]; own: unknown }
      cast: unknown[]
    }

    expect(response.status).toBe(200)
    expect(body.timeline.nodes.some((node) => node.self)).toBe(false)
    expect(body.timeline.own).toBeNull()
    expect(body.cast).toEqual([
      {
        handle: 'pioneer',
        name: 'Cleo',
        photo: null,
        groups: ['pioneers'],
        node: 1,
      },
      {
        handle: 'founder-one',
        name: 'Founder one',
        photo: null,
        groups: [],
        node: null,
      },
    ])
    expect(JSON.stringify(body)).not.toContain('@')
  })

  it('is not found for a member without network:present (R-ROLE-3)', async () => {
    const response = await request(setup())
      .get('/api/admin/presentation')
      .set('Cookie', await cookieFor('m-ada'))

    expect(response.status).toBe(404)
  })
})
