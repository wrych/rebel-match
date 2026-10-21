import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { fixedSettings, loadConfig } from '../config.js'
import { configPolicy } from '../permissions.js'
import type { BanService } from '../services/bans.js'
import { adminBanRoutes } from './admin-bans.js'

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

function setup(): { app: Express; calls: unknown[][] } {
  const calls: unknown[][] = []
  const bans: BanService = {
    ban: (memberId, actorId, note) => {
      calls.push(['ban', memberId, actorId, note])
      if (memberId === actorId) return Promise.resolve('self')
      return Promise.resolve(memberId === 'm-rik' ? 'banned' : 'not_found')
    },
    unban: (memberId, actorId) => {
      calls.push(['unban', memberId, actorId])
      return Promise.resolve(memberId === 'm-rik' ? 'unbanned' : 'not_found')
    },
  }
  const app = express()
  app.use(express.json())
  app.use(adminBanRoutes({ auth, bans, settings: fixedSettings(config) }))
  return { app, calls }
}

async function cookieFor(memberId: string): Promise<string> {
  const cookie = await auth.createSession(memberId)
  return `${cookie.name}=${cookie.value}`
}

describe('admin ban routes (R-MOD-9)', () => {
  it.each([
    ['m-rik', { note: 'Spam.' }, 204],
    ['m-nobody', { note: 'Spam.' }, 404],
    ['m-admin', { note: 'Spam.' }, 409],
    ['m-rik', { note: '   ' }, 400],
    ['m-rik', {}, 400],
    ['m-rik', { note: 'x'.repeat(501) }, 400],
  ])('bans %s with %o as %i', async (id, body, status) => {
    const response = await request(setup().app)
      .post(`/api/admin/members/${id}/ban`)
      .set('Cookie', await cookieFor('m-admin'))
      .send(body)

    expect(response.status).toBe(status)
  })

  it('records the host and the trimmed reason', async () => {
    const { app, calls } = setup()

    await request(app)
      .post('/api/admin/members/m-rik/ban')
      .set('Cookie', await cookieFor('m-admin'))
      .send({ note: ' Selling. ' })

    expect(calls).toEqual([['ban', 'm-rik', 'm-admin', 'Selling.']])
  })

  it.each([
    ['m-rik', 204],
    ['m-nobody', 404],
  ])('lifts the ban on %s with %i', async (id, status) => {
    const response = await request(setup().app)
      .post(`/api/admin/members/${id}/unban`)
      .set('Cookie', await cookieFor('m-admin'))

    expect(response.status).toBe(status)
  })

  it('lets nobody without member:ban ban or lift a ban (R-ROLE-3)', async () => {
    const { app, calls } = setup()
    const cookie = await cookieFor('m-member')

    const ban = await request(app)
      .post('/api/admin/members/m-rik/ban')
      .set('Cookie', cookie)
      .send({ note: 'Spam.' })
    const unban = await request(app)
      .post('/api/admin/members/m-rik/unban')
      .set('Cookie', cookie)

    expect([ban.status, unban.status]).toEqual([404, 404])
    expect(calls).toEqual([])
  })
})
