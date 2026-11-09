import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  isKnownPath,
  pageTitle,
  pathTo,
  routeTable,
  type ScreenName,
  nextOf,
  safeNextPath,
  titleForPath,
} from './routes.js'

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

describe('nextOf (R-CODE-3, R-NAV-6)', () => {
  it('keeps the fragment on the profile code paths, with any query', () => {
    expect(nextOf('/p#t=abc')).toBe('/p#t=abc')
    expect(nextOf('/p/connect?x=1#t=abc')).toBe('/p/connect?x=1#t=abc')
  })

  it('drops the fragment on every other path, keeping its query', () => {
    expect(nextOf('/matches?x=1#t=abc')).toBe('/matches?x=1')
    expect(nextOf('/people#t=abc')).toBe('/people')
    expect(nextOf('/p/elsewhere#t=abc')).toBe('/p/elsewhere')
  })
})

describe('safeNextPath', () => {
  it('never carries a live code through sign-in (R-CODE-7)', () => {
    expect(safeNextPath('/c#t=abc')).toBe('/')
    expect(safeNextPath('/c')).toBe('/')
    expect(safeNextPath('/challenges/1')).toBe('/challenges/1')
  })

  it('keeps a profile code through sign-in, and no other fragment', () => {
    expect(safeNextPath('/p#t=abc')).toBe('/p#t=abc')
    expect(safeNextPath('/matches#t=abc')).toBe('/matches')
  })

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

  it('serves the privacy notice and the terms without a session (R-ONB-9, R-ONB-13)', () => {
    const public_ = routeTable
      .filter((route) => route.access === 'public')
      .map((route) => route.path)

    expect(public_).toEqual(expect.arrayContaining(['/privacy', '/terms']))
  })
})

describe('titleForPath (R-NAV-13)', () => {
  it('gives every route a title of its own words', () => {
    for (const route of routeTable)
      expect(route.title.trim(), route.name).not.toBe('')
  })

  it('names the app first, then the screen', () => {
    expect(pageTitle('Welcome')).toBe('Rebel Match | Welcome')
  })

  it('titles a parameterised path by its screen, ignoring the query', () => {
    expect(titleForPath('/challenges/abc-123/matches?posted=1')).toBe(
      'Rebel Match | Your matches',
    )
  })

  it('titles a path no screen serves as not found', () => {
    expect(titleForPath('/admin/secrets')).toBe('Rebel Match | Not found')
  })
})

describe('pathTo', () => {
  const untypedPathTo = pathTo as (
    name: string,
    params?: Record<string, string>,
  ) => string
  const paramsOf = (path: string): Record<string, string> =>
    Object.fromEntries(
      [...path.matchAll(/:(\w+)/g)].map(([, name = '']) => [name, `${name}-1`]),
    )

  it('fills every screen in the table to a path the table knows', () => {
    for (const route of routeTable) {
      const path = untypedPathTo(route.name, paramsOf(route.path))

      expect(path, route.name).not.toContain(':')
      expect(isKnownPath(path), route.name).toBe(true)
    }
  })

  it('gives a screen without parameters its path as written', () => {
    expect(pathTo('admin-applicants')).toBe('/admin/applicants')
  })

  it('puts each value where its parameter stands', () => {
    expect(pathTo('connect', { challengeId: 'c-1', memberId: 'm-2' })).toBe(
      '/challenges/c-1/connect/m-2',
    )
  })

  it('encodes each value as one path segment', () => {
    expect(pathTo('request-contact', { id: 'a/b?c=d e#f' })).toBe(
      '/matches/requests/a%2Fb%3Fc%3Dd%20e%23f/contact',
    )
  })

  it('refuses a name the table lacks', () => {
    expect(() => untypedPathTo('no-such-screen')).toThrow('no-such-screen')
  })

  it('refuses to leave a parameter unfilled', () => {
    expect(() => untypedPathTo('connect', { challengeId: 'c-1' })).toThrow(
      ':memberId',
    )
  })

  it('types the names and the parameters each screen takes', () => {
    expectTypeOf<'cockpit'>().toExtend<ScreenName>()
    expectTypeOf<'no-such-screen'>().not.toExtend<ScreenName>()
    expectTypeOf(pathTo<'connect'>)
      .parameter(1)
      .toEqualTypeOf<Record<'challengeId' | 'memberId', string>>()
    expectTypeOf(pathTo<'cockpit'>).parameters.toEqualTypeOf<['cockpit']>()
  })
})
