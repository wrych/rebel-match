import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { securityHeaders } from './security-headers.js'

function served(publicUrl: string): Promise<request.Response> {
  const app = express()
  app.use(securityHeaders({ publicUrl }))
  app.get('/', (_request, response) => {
    response.send('ok')
  })
  return request(app).get('/')
}

describe('securityHeaders (ADR 0034)', () => {
  it('allows only this origin, with no inline script and no framing', async () => {
    const csp = (await served('https://match.example.org')).headers[
      'content-security-policy'
    ] as string

    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("script-src 'self';")
    expect(csp).not.toContain('unsafe-inline')
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
  })

  it('sends no referrer, no sniffing and no framework name', async () => {
    const headers = (await served('https://match.example.org')).headers

    expect(headers['referrer-policy']).toBe('no-referrer')
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['x-powered-by']).toBeUndefined()
  })

  it('asks for https for a year on an https deployment only', async () => {
    expect(
      (await served('https://match.example.org')).headers[
        'strict-transport-security'
      ],
    ).toMatch(/^max-age=31536000/)
    expect(
      (await served('http://localhost:5173')).headers[
        'strict-transport-security'
      ],
    ).toBeUndefined()
  })
})
