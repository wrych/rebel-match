import { describe, expect, it } from 'vitest'
import { configPolicy } from './permissions.js'

describe('configPolicy.permissionsOf', () => {
  it('grants a member what the member role carries', () => {
    expect(configPolicy.permissionsOf(['member'])).toEqual([
      'challenge:create',
      'challenge:swipe',
      'connection:request',
    ])
  })

  it('takes the union when a member holds several roles (R-ROLE-2)', () => {
    const permissions = configPolicy.permissionsOf(['member', 'admin'])

    expect(permissions).toContain('challenge:swipe')
    expect(permissions).toContain('outbox:read')
    expect(new Set(permissions).size).toBe(permissions.length)
  })

  it('grants nothing for no roles', () => {
    expect(configPolicy.permissionsOf([])).toEqual([])
  })

  it('grants nothing for a role the matrix does not know', () => {
    expect(configPolicy.permissionsOf(['moderator', 'toString'])).toEqual([])
  })
})

describe('configPolicy.knowsRole', () => {
  it('knows the roles in the matrix, and nothing else', () => {
    expect(configPolicy.knowsRole('admin')).toBe(true)
    expect(configPolicy.knowsRole('member')).toBe(true)
    expect(configPolicy.knowsRole('moderator')).toBe(false)
    expect(configPolicy.knowsRole('toString')).toBe(false)
  })
})

describe('configPolicy.rolesGranting', () => {
  it('names every role that carries a permission', () => {
    expect(configPolicy.rolesGranting('outbox:read')).toEqual(['admin'])
    expect(configPolicy.rolesGranting('challenge:swipe')).toEqual(['member'])
  })
})
