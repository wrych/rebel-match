import { describe, expect, it } from 'vitest'
import { DEV_ADMIN_EMAIL } from './dev/people.js'
import { planSeed } from './plan.js'
import { trends } from './shared/trends.js'

const SMTP = { delivery: 'smtp' } as const
const NONE = { delivery: 'none' } as const

describe('planSeed', () => {
  it('seeds the roles in every profile (R-SEED-1)', () => {
    for (const seedProfile of ['dev', 'prod'] as const) {
      const plan = planSeed({ seedProfile, env: 'development', mail: SMTP })
      expect(plan.roles.map((role) => role.key)).toEqual(['member', 'admin'])
    }
  })

  it('seeds the sector and company size lists in every profile (R-SEED-1)', () => {
    for (const seedProfile of ['dev', 'prod'] as const) {
      const plan = planSeed({ seedProfile, env: 'development', mail: SMTP })
      expect(plan.sectors.map((sector) => sector.key)).toContain('healthcare')
      expect(plan.companySizes).toHaveLength(5)
    }
  })

  it('seeds the fictional roster and the dev admin for dev (R-SEED-2)', () => {
    const plan = planSeed({
      seedProfile: 'dev',
      env: 'development',
      mail: NONE,
    })
    const admin = plan.members.find((m) => m.email === DEV_ADMIN_EMAIL)

    expect(admin?.roles).toEqual(['member', 'admin'])
    expect(plan.members.length).toBeGreaterThan(10)
  })

  it('gives every fixture a non-routable address (constitution §5)', () => {
    const { members } = planSeed({
      seedProfile: 'dev',
      env: 'development',
      mail: NONE,
    })

    for (const member of members) expect(member.email).toMatch(/\.invalid$/)
    expect(new Set(members.map((m) => m.email)).size).toBe(members.length)
  })

  it('grants every fixture the member role, and admin to one only', () => {
    const { members } = planSeed({
      seedProfile: 'dev',
      env: 'test',
      mail: NONE,
    })

    for (const member of members) expect(member.roles).toContain('member')
    expect(members.filter((m) => m.roles.includes('admin'))).toHaveLength(1)
  })

  it('refuses dev fixtures in production (R-SEED-4)', () => {
    expect(() =>
      planSeed({ seedProfile: 'dev', env: 'production', mail: SMTP }),
    ).toThrow(/R-SEED-4/)
  })

  it('refuses the prod profile in a development deployment (R-SEED-8)', () => {
    expect(() =>
      planSeed({ seedProfile: 'prod', env: 'development', mail: NONE }),
    ).toThrow(/R-SEED-8/)
  })

  it('allows the prod profile on a development machine that sends real mail', () => {
    // Not a development deployment: its log redacts (requirements §8c).
    expect(
      planSeed({ seedProfile: 'prod', env: 'development', mail: SMTP }).roles,
    ).toHaveLength(2)
  })

  it('seeds no fictional member for prod', () => {
    expect(
      planSeed({ seedProfile: 'prod', env: 'production', mail: SMTP }).members,
    ).toEqual([])
  })

  it('seeds the 8 trends and their case studies in every profile (R-ASK-5,8)', () => {
    for (const seedProfile of ['dev', 'prod'] as const) {
      const plan = planSeed({ seedProfile, env: 'development', mail: SMTP })

      expect(plan.trends.map((t) => t.id)).toEqual([
        '01',
        '02',
        '03',
        '04',
        '05',
        '06',
        '07',
        '08',
      ])
      for (const trend of plan.trends) {
        expect(plan.cases.some((c) => c.trendId === trend.id)).toBe(true)
      }
    }
  })

  it('links every case study to the Corporate Rebels blog', () => {
    const { cases } = planSeed({
      seedProfile: 'prod',
      env: 'production',
      mail: SMTP,
    })

    for (const item of cases) {
      expect(item.url).toMatch(/^https:\/\/www\.corporate-rebels\.com\/blog\//)
    }
  })

  it('gives production no fictional challenges or offers (R-SEED-4)', () => {
    const plan = planSeed({
      seedProfile: 'prod',
      env: 'production',
      mail: SMTP,
    })

    expect(plan.challenges).toEqual([])
    expect(plan.expertise).toEqual([])
  })

  it('attributes every dev challenge and offer to a seeded member on a known trend', () => {
    const plan = planSeed({
      seedProfile: 'dev',
      env: 'development',
      mail: NONE,
    })
    const emails = new Set(plan.members.map((m) => m.email))
    const ids = new Set(trends.map((t) => t.id))

    for (const c of plan.challenges) {
      expect(emails.has(c.authorEmail)).toBe(true)
      expect(ids.has(c.trendId)).toBe(true)
      expect(c.body.length).toBeGreaterThan(30)
    }
    for (const e of plan.expertise) {
      expect(emails.has(e.email)).toBe(true)
      expect(ids.has(e.trendId)).toBe(true)
    }
  })
})
