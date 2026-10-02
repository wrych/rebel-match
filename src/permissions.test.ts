import { describe, expect, it } from 'vitest'
import { resolvePermissions } from './permissions.js'

describe('resolvePermissions', () => {
  it('grants a member what the member role carries', () => {
    expect(resolvePermissions(['member'])).toEqual([
      'challenge:create',
      'challenge:swipe',
      'connection:request',
    ])
  })

  it('takes the union when a member holds several roles (R-ROLE-2)', () => {
    const permissions = resolvePermissions(['member', 'admin'])

    expect(permissions).toContain('challenge:swipe')
    expect(permissions).toContain('outbox:read')
    expect(new Set(permissions).size).toBe(permissions.length)
  })

  it('grants nothing for no roles', () => {
    expect(resolvePermissions([])).toEqual([])
  })

  it('grants nothing for a role the matrix does not know', () => {
    expect(resolvePermissions(['moderator', 'toString'])).toEqual([])
  })
})
