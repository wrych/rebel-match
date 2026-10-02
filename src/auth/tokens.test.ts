import { describe, expect, it } from 'vitest'
import { loadConfig } from '../config.js'
import type { TokenRecord } from './store.js'
import { hashSecret, judgeToken, linkLifetimeMs, newSecret } from './tokens.js'

const { limits } = loadConfig({
  DATABASE_URL: 'mysql://user:pw@localhost:3306/rebel_match',
  SESSION_SECRET: 'x'.repeat(32),
})

const now = new Date('2026-11-08T10:00:00Z')

function token(overrides: Partial<TokenRecord> = {}): TokenRecord {
  return {
    id: 't1',
    memberId: 'm1',
    tokenHash: 'h',
    kind: 'self_service',
    nextPath: '/',
    expiresAt: new Date(now.getTime() + 60_000),
    usedAt: null,
    ...overrides,
  }
}

describe('newSecret', () => {
  it('is URL-safe and never repeats', () => {
    const a = newSecret()

    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(newSecret()).not.toBe(a)
  })
})

describe('hashSecret', () => {
  it('stores a SHA-256 digest, never the secret itself (R-NFR-5)', () => {
    const raw = newSecret()
    const hash = hashSecret(raw)

    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain(raw)
    expect(hashSecret(raw)).toBe(hash)
  })
})

describe('linkLifetimeMs', () => {
  it('gives a self-service link the short lifetime (R-AUTH-5)', () => {
    expect(linkLifetimeMs('self_service', limits)).toBe(15 * 60_000)
  })

  it('gives an approval link its own, longer one (R-AUTH-10)', () => {
    expect(linkLifetimeMs('approval', limits)).toBe(24 * 3_600_000)
  })
})

describe('judgeToken', () => {
  it('accepts an unused token before it expires', () => {
    expect(judgeToken(token(), now)).toBe('valid')
  })

  it('refuses a token at the instant it expires (R-AUTH-5)', () => {
    expect(judgeToken(token({ expiresAt: now }), now)).toBe('expired')
  })

  it('refuses a token that was already used', () => {
    expect(judgeToken(token({ usedAt: now }), now)).toBe('used')
  })

  it('calls a used, since-expired token used', () => {
    const stale = token({ usedAt: now, expiresAt: new Date(0) })

    expect(judgeToken(stale, now)).toBe('used')
  })
})
