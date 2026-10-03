import { describe, expect, it } from 'vitest'
import { refusalFor } from './invite-redemption.js'

const now = new Date('2026-11-08T10:00:00Z')
const usable = {
  validFrom: new Date(now.getTime() - 1),
  validUntil: new Date(now.getTime() + 1),
  maxUses: 2,
  uses: 1,
  revokedAt: null,
}

describe('refusalFor', () => {
  it.each([
    [null, {}],
    ['not_yet_valid', { validFrom: new Date(now.getTime() + 1) }],
    ['expired', { validUntil: now }],
    ['exhausted', { uses: 2 }],
    ['revoked', { revokedAt: now }],
  ] as const)('names %s for analytics (R-INV-5)', (refusal, overrides) => {
    expect(refusalFor({ ...usable, ...overrides }, now)).toBe(refusal)
  })
})
