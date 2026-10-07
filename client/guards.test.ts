import { describe, expect, it } from 'vitest'
import { decide, type Target } from './guards'
import type { Me } from './lib/session'

const admin: Me = {
  id: 'a',
  name: 'Dev Admin',
  onboarded: true,
  analyticsOptIn: false,
  roles: ['member', 'admin'],
  permissions: ['outbox:read'],
}
const member: Me = { ...admin, roles: ['member'], permissions: [] }
const newcomer: Me = { ...member, name: null, onboarded: false }

function target(
  path: string,
  access: Target['access'],
  permission?: string,
): Target {
  return { path, fullPath: path, access, permission }
}

describe('decide', () => {
  it('lets anyone open a public screen', () => {
    expect(decide(target('/access-requested', 'public'), null)).toEqual({
      kind: 'allow',
    })
  })

  it.each(['/', '/login'])(
    'sends a signed-in member from %s to their home',
    (path) => {
      expect(decide(target(path, 'public'), admin)).toEqual({
        kind: 'redirect',
        to: '/welcome',
      })
      expect(decide(target(path, 'public'), newcomer)).toEqual({
        kind: 'redirect',
        to: '/onboarding',
      })
    },
  )

  it('sends a signed-out deep link to login, remembering it (R-NAV-5)', () => {
    const deep: Target = {
      path: '/matches/requests/r1',
      fullPath: '/matches/requests/r1?x=1',
      access: 'onboarded',
    }

    expect(decide(deep, null)).toEqual({
      kind: 'redirect',
      to: '/login?next=%2Fmatches%2Frequests%2Fr1%3Fx%3D1',
    })
  })

  it('puts onboarding first, carrying the target (R-NAV-7)', () => {
    expect(decide(target('/matches', 'onboarded'), newcomer)).toEqual({
      kind: 'redirect',
      to: '/onboarding?next=%2Fmatches',
    })
  })

  it('lets an un-onboarded member reach a session screen', () => {
    expect(decide(target('/onboarding', 'session'), newcomer)).toEqual({
      kind: 'allow',
    })
  })

  describe('onboarding steps (R-ONB-6, design §4)', () => {
    const returning: Me = { ...newcomer, name: 'Ada' }
    const withNext = (path: string): Target => ({
      path,
      fullPath: `${path}?next=%2Fmatches`,
      access: 'session',
    })

    it.each(['/onboarding', '/onboarding/privacy'])(
      'sends an onboarded member from %s to welcome',
      (path) => {
        expect(decide(target(path, 'session'), member, true)).toEqual({
          kind: 'redirect',
          to: '/welcome',
        })
      },
    )

    it('sends the privacy step back to the profile step when nothing was typed in this tab, keeping next (R-ONB-7)', () => {
      expect(decide(withNext('/onboarding/privacy'), newcomer)).toEqual({
        kind: 'redirect',
        to: '/onboarding?next=%2Fmatches',
      })
    })

    it('opens the privacy step once a profile was typed', () => {
      expect(
        decide(target('/onboarding/privacy', 'session'), newcomer, true),
      ).toEqual({ kind: 'allow' })
    })

    it('takes a member with a stored name straight to the new words, keeping next (F2, R-ONB-4)', () => {
      expect(decide(withNext('/onboarding'), returning)).toEqual({
        kind: 'redirect',
        to: '/onboarding/privacy?next=%2Fmatches',
      })
      expect(
        decide(target('/onboarding/privacy', 'session'), returning),
      ).toEqual({ kind: 'allow' })
    })

    it('sends a member who already shares from the usage step to welcome (R-ONB-11, R-ANA-6)', () => {
      expect(
        decide(target('/onboarding/usage', 'onboarded'), {
          ...member,
          analyticsOptIn: true,
        }),
      ).toEqual({ kind: 'redirect', to: '/welcome' })
    })

    it('keeps the usage step for onboarded members (R-ONB-11)', () => {
      expect(decide(target('/onboarding/usage', 'onboarded'), member)).toEqual({
        kind: 'allow',
      })
      expect(
        decide(target('/onboarding/usage', 'onboarded'), newcomer),
      ).toMatchObject({ kind: 'redirect' })
    })
  })

  it('shows not found, never forbidden, without the permission (R-NAV-8)', () => {
    expect(
      decide(target('/admin/outbox', 'onboarded', 'outbox:read'), member),
    ).toEqual({
      kind: 'not-found',
    })
  })

  it('lets a member holding the permission through', () => {
    expect(
      decide(target('/admin/outbox', 'onboarded', 'outbox:read'), admin),
    ).toEqual({
      kind: 'allow',
    })
  })
})
