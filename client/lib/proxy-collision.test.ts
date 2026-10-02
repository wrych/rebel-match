import { readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import config from '../../vite.config'

const clientRoot = fileURLToPath(new URL('..', import.meta.url))

function servedPaths(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return servedPaths(full)

    return [`/${relative(clientRoot, full).split(sep).join('/')}`]
  })
}

function proxyPatterns(): string[] {
  const proxy = config.server?.proxy ?? {}

  return Object.keys(proxy)
}

describe('the dev proxy', () => {
  it('anchors every pattern, so it cannot capture by prefix', () => {
    const patterns = proxyPatterns()

    expect(patterns.length).toBeGreaterThan(0)
    for (const pattern of patterns) {
      expect(pattern.startsWith('^')).toBe(true)
    }
  })

  it('captures no client module', () => {
    // A plain '/api' key matches '/api.ts' too, which proxies a client module to
    // the server and serves it back as HTML. Guarding the invariant rather than
    // the one filename that happened to collide.
    const matchers = proxyPatterns().map((pattern) => new RegExp(pattern, 'u'))
    const captured = servedPaths(clientRoot).filter((path) =>
      matchers.some((matcher) => matcher.test(path)),
    )

    expect(captured).toEqual([])
  })

  it('still captures the endpoints the client calls', () => {
    const matchers = proxyPatterns().map((pattern) => new RegExp(pattern, 'u'))
    const proxied = (path: string): boolean =>
      matchers.some((matcher) => matcher.test(path))

    expect(proxied('/api/config')).toBe(true)
    expect(proxied('/api')).toBe(true)
    expect(proxied('/auth/verify')).toBe(true)
  })
})
