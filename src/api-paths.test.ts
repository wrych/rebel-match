import { describe, expect, expectTypeOf, it } from 'vitest'
import { apiPaths, fill, type ApiPath, type PathParams } from './api-paths.js'

const patterns: ApiPath[] = Object.values(apiPaths)
const namesIn = (pattern: string): string[] =>
  [...pattern.matchAll(/:(\w+)/g)].map(([, name]) => name ?? '')

describe('fill', () => {
  it('puts each value where its parameter stands', () => {
    expect(fill(apiPaths.memberRole, { id: 'm-1', role: 'host' })).toBe(
      '/api/admin/members/m-1/roles/host',
    )
  })

  it('encodes each value as one path segment', () => {
    expect(fill(apiPaths.challenge, { id: 'a/b?c=d e#f' })).toBe(
      '/api/challenges/a%2Fb%3Fc%3Dd%20e%23f',
    )
  })

  it('keeps what follows a parameter in its segment', () => {
    expect(fill(apiPaths.eventBadgeLogo, { id: 'b 1' })).toBe(
      '/api/event-badges/b%201/logo.svg',
    )
  })

  it('refuses to leave a parameter unfilled', () => {
    const partial = { id: 'm-1' } as Record<'id' | 'role', string>

    expect(() => fill(apiPaths.memberRole, partial)).toThrow(':role')
  })

  it('fills every parameter of every pattern', () => {
    for (const pattern of patterns) {
      const params = Object.fromEntries(
        namesIn(pattern).map((name) => [name, `${name}-value`]),
      ) as Record<PathParams<ApiPath>, string>

      expect(fill(pattern, params)).not.toContain(':')
    }
  })
})

describe('apiPaths', () => {
  it('names each pattern once', () => {
    expect(new Set(patterns).size).toBe(patterns.length)
  })

  it('declares only parameters a path can carry', () => {
    for (const pattern of patterns) {
      expect(pattern).toMatch(/^\/(api|auth)\/[\w\-./:]*$/)
      expect(pattern.replace(/:\w+/g, '')).not.toContain(':')
    }
  })

  it('types the parameters a pattern names', () => {
    expectTypeOf<PathParams<typeof apiPaths.memberRole>>().toEqualTypeOf<
      'id' | 'role'
    >()
    expectTypeOf<
      PathParams<typeof apiPaths.eventBadgeLogo>
    >().toEqualTypeOf<'id'>()
    expectTypeOf<PathParams<typeof apiPaths.cockpit>>().toEqualTypeOf<never>()
  })
})
