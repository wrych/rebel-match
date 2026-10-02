import { describe, expect, it } from 'vitest'
import { DEV_ADMIN_EMAIL } from './dev/people.js'
import { planSeed } from './plan.js'

describe('planSeed', () => {
  it('seeds the roles in every profile (R-SEED-1)', () => {
    for (const seedProfile of ['dev', 'prod'] as const) {
      const plan = planSeed({ seedProfile, env: 'development' })
      expect(plan.roles.map((role) => role.key)).toEqual(['member', 'admin'])
    }
  })

  it('seeds the fictional roster and the dev admin for dev (R-SEED-2)', () => {
    const plan = planSeed({ seedProfile: 'dev', env: 'development' })
    const admin = plan.members.find((m) => m.email === DEV_ADMIN_EMAIL)

    expect(admin?.roles).toEqual(['member', 'admin'])
    expect(plan.members.length).toBeGreaterThan(10)
  })

  it('gives every fixture a non-routable address (constitution §5)', () => {
    const { members } = planSeed({ seedProfile: 'dev', env: 'development' })

    for (const member of members) expect(member.email).toMatch(/\.invalid$/)
    expect(new Set(members.map((m) => m.email)).size).toBe(members.length)
  })

  it('grants every fixture the member role, and admin to one only', () => {
    const { members } = planSeed({ seedProfile: 'dev', env: 'test' })

    for (const member of members) expect(member.roles).toContain('member')
    expect(members.filter((m) => m.roles.includes('admin'))).toHaveLength(1)
  })

  it('refuses dev fixtures in production (R-SEED-4)', () => {
    expect(() => planSeed({ seedProfile: 'dev', env: 'production' })).toThrow(
      /R-SEED-4/,
    )
  })

  it('seeds no fictional member for prod', () => {
    expect(
      planSeed({ seedProfile: 'prod', env: 'production' }).members,
    ).toEqual([])
  })
})
