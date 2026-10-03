import { describe, expect, it } from 'vitest'
import { loadConfig } from '../config.js'
import { DEV_ADMIN_EMAIL } from '../seed/dev/people.js'
import { devLoginRefusal, seededMember, signInBanner } from './guard.js'

const base = {
  DATABASE_URL: 'postgres://user:pw@localhost:5432/rebel_match',
  SESSION_SECRET: 'x'.repeat(32),
}
const dev = loadConfig(base)

describe('devLoginRefusal', () => {
  it('allows a development deployment on the dev seed (R-DEV-6)', () => {
    expect(devLoginRefusal(dev)).toBeNull()
  })

  it.each([
    [{ NODE_ENV: 'test' }, /NODE_ENV=development/],
    [
      { MAIL_DELIVERY: 'smtp', SMTP_HOST: 'mail.example.org' },
      /MAIL_DELIVERY=none/,
    ],
    [{ SEED_PROFILE: 'prod' }, /SEED_PROFILE=dev/],
  ])('refuses %j, saying why', (overrides, reason) => {
    expect(devLoginRefusal(loadConfig({ ...base, ...overrides }))).toMatch(
      reason,
    )
  })
})

describe('seededMember', () => {
  it('finds the dev admin by default address, ignoring case and space', () => {
    expect(
      seededMember(dev, ` ${DEV_ADMIN_EMAIL.toUpperCase()} `)?.roles,
    ).toEqual(['member', 'admin'])
  })

  it('finds any other seeded member', () => {
    expect(seededMember(dev, 'sanne.kuipers@example.invalid')?.roles).toEqual([
      'member',
    ])
  })

  it('is null for an address the dev seed does not hold', () => {
    expect(seededMember(dev, 'someone@example.org')).toBeNull()
  })
})

describe('signInBanner', () => {
  it('shows the link and the roles, and no address (constitution §5)', () => {
    const banner = signInBanner('http://localhost:5173/auth/verify?token=t', [
      'member',
      'admin',
    ])

    expect(banner).toContain('http://localhost:5173/auth/verify?token=t')
    expect(banner).toContain('roles: member, admin')
    expect(banner).not.toContain('@')
  })
})
