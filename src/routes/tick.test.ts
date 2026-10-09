import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { freshSettings, tickRoutes } from './tick.js'

const SCHEDULER = 'Bearer scheduler-token'

function setup(outcome = true): { app: Express; run: () => Promise<boolean> } {
  const run = vi.fn(() => Promise.resolve(outcome))
  const app = express()
  app.use(
    tickRoutes({
      tick: { run },
      isInvoker: (authorization) =>
        Promise.resolve(authorization === SCHEDULER),
    }),
  )
  return { app, run }
}

describe('POST /api/internal/tick (ADR 0049)', () => {
  it('runs the due work for the scheduler and answers 204', async () => {
    const { app, run } = setup()

    await request(app)
      .post('/api/internal/tick')
      .set('Authorization', SCHEDULER)
      .expect(204)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('answers 500 when some of the work failed, so the scheduler records it', async () => {
    const { app } = setup(false)

    await request(app)
      .post('/api/internal/tick')
      .set('Authorization', SCHEDULER)
      .expect(500, { error: 'internal_error' })
  })

  it('answers anyone else not found, and runs nothing', async () => {
    const { app, run } = setup()

    await request(app)
      .post('/api/internal/tick')
      .set('Authorization', 'Bearer forged')
      .expect(404, { error: 'not_found' })
    await request(app).post('/api/internal/tick').expect(404)
    expect(run).not.toHaveBeenCalled()
  })
})

describe('freshSettings (ADR 0049)', () => {
  it('brings the settings up to date before the request is handled', async () => {
    const order: string[] = []
    const app = express()
    app.use(
      freshSettings(() => {
        order.push('fresh')
        return Promise.resolve()
      }),
    )
    app.get('/', (_request, response) => {
      order.push('handled')
      response.end()
    })

    await request(app).get('/').expect(200)
    expect(order).toEqual(['fresh', 'handled'])
  })
})
