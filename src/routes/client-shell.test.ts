import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import express, { type Express } from 'express'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clientShellRoutes } from './client-shell.js'

const SHELL = '<!doctype html><title>Rebel Match</title><div id="app"></div>'

let dir: string
let app: Express

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'client-shell-'))
  mkdirSync(join(dir, 'assets'))
  writeFileSync(join(dir, 'index.html'), SHELL)
  writeFileSync(join(dir, 'assets', 'main-abc123.js'), 'console.log(1)')
  writeFileSync(join(dir, 'favicon.svg'), '<svg/>')

  app = express()
  app.use(clientShellRoutes(dir))
  app.use((_request, response) => {
    response.status(404).json({ error: 'not_found' })
  })
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('clientShellRoutes (ADR 0017)', () => {
  it('serves the shell with 200 for every path in the route table', async () => {
    for (const path of ['/', '/login', '/matches', '/challenges/7/matches']) {
      const response = await request(app).get(path)

      expect(response.status, path).toBe(200)
      expect(response.text).toBe(SHELL)
      expect(response.headers['cache-control']).toBe('no-cache')
    }
  })

  it('serves the shell with 404 for a path not in the table', async () => {
    const response = await request(app).get('/no-such-screen')

    expect(response.status).toBe(404)
    expect(response.text).toBe(SHELL)
  })

  it('keeps the query string out of the route match', async () => {
    const response = await request(app).get('/login?next=%2Fmatches')

    expect(response.status).toBe(200)
  })

  it('serves hashed assets for good, and other files as they are', async () => {
    const asset = await request(app).get('/assets/main-abc123.js')
    expect(asset.status).toBe(200)
    expect(asset.headers['cache-control']).toContain('immutable')

    const icon = await request(app).get('/favicon.svg')
    expect(icon.status).toBe(200)
    expect(icon.headers['cache-control']).not.toContain('immutable')
  })

  it('answers a missing asset with 404, not the shell', async () => {
    const response = await request(app).get('/assets/gone-000.js')

    expect(response.status).toBe(404)
    expect(response.text).toBe('Not Found')
  })

  it('never stands in for the server under /api or /auth', async () => {
    for (const path of ['/api/nothing', '/auth/nothing']) {
      const response = await request(app).get(path)

      expect(response.status, path).toBe(404)
      expect(response.body).toEqual({ error: 'not_found' })
    }
  })

  it('refuses to start without a built client', () => {
    expect(() => clientShellRoutes(join(dir, 'missing'))).toThrow(/CLIENT_DIR/)
  })
})
