import { describe, expect, it } from 'vitest'
import { isKnownPath, routeTable, safeNextPath } from './routes.js'

describe('isKnownPath', () => {
  it('recognises a static route', () => {
    expect(isKnownPath('/matches')).toBe(true)
  })

  it('recognises a parameterised route', () => {
    expect(isKnownPath('/challenges/abc-123/matches')).toBe(true)
  })

  it('ignores the query string and fragment, which are not routes', () => {
    expect(isKnownPath('/login?invite=xyz#top')).toBe(true)
  })

  it('rejects an unknown path', () => {
    expect(isKnownPath('/admin/secrets')).toBe(false)
  })

  it('rejects a parameterised route with the segment missing', () => {
    expect(isKnownPath('/challenges//matches')).toBe(false)
  })

  it('rejects a longer path that merely starts with a route', () => {
    expect(isKnownPath('/matches/requests/1/contact/extra')).toBe(false)
  })
})

describe('safeNextPath', () => {
  it('passes a known in-app path through', () => {
    expect(safeNextPath('/matches/requests/42')).toBe('/matches/requests/42')
  })

  it('falls back to the root when nothing was asked for', () => {
    expect(safeNextPath(undefined)).toBe('/')
    expect(safeNextPath('')).toBe('/')
  })

  it('refuses an absolute url', () => {
    expect(safeNextPath('https://evil.example/steal')).toBe('/')
  })

  it('refuses a protocol-relative url, the classic open redirect', () => {
    expect(safeNextPath('//evil.example/steal')).toBe('/')
  })

  it('refuses a backslash-escaped host, which some clients normalise', () => {
    expect(safeNextPath('/\\evil.example')).toBe('/')
  })

  it('refuses an embedded scheme', () => {
    expect(safeNextPath('/redirect?to=https://evil.example')).toBe('/')
  })

  it('refuses a relative path with no leading slash', () => {
    expect(safeNextPath('matches')).toBe('/')
  })

  it('refuses a path that is not in the table', () => {
    expect(safeNextPath('/not-a-screen')).toBe('/')
  })
})

describe('routeTable', () => {
  it('has unique names, since the router keys on them', () => {
    const names = routeTable.map((route) => route.name)

    expect(new Set(names).size).toBe(names.length)
  })

  it('gates every admin route on a permission, never on a role name', () => {
    const admin = routeTable.filter((route) => route.path.startsWith('/admin'))

    expect(admin.length).toBeGreaterThan(0)
    for (const route of admin) {
      expect(route.permission).toBeDefined()
    }
  })

  it('keeps the entry and login screens reachable without a session', () => {
    const public_ = routeTable
      .filter((route) => route.access === 'public')
      .map((route) => route.path)

    expect(public_).toContain('/')
    expect(public_).toContain('/login')
    expect(public_).toContain('/access-requested')
  })
})
