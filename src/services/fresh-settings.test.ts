import { describe, expect, it, vi } from 'vitest'
import { createFreshSettings } from './fresh-settings.js'

describe('createFreshSettings (ADR 0031, ADR 0048)', () => {
  it('reads at first, then again only once the copy is older than the limit', async () => {
    let at = 0
    const refresh = vi.fn(() => Promise.resolve())
    const fresh = createFreshSettings({
      settings: { refresh },
      maxAgeSeconds: 60,
      now: () => at,
      onError: vi.fn(),
    })

    await fresh()
    at = 59_999
    await fresh()
    at = 60_000
    await fresh()

    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('lets concurrent callers share one read', async () => {
    const refresh = vi.fn(() => Promise.resolve())
    const fresh = createFreshSettings({
      settings: { refresh },
      maxAgeSeconds: 60,
      onError: vi.fn(),
    })

    await Promise.all([fresh(), fresh(), fresh()])

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('reports a failed read without failing the caller', async () => {
    const onError = vi.fn()
    const fresh = createFreshSettings({
      settings: { refresh: () => Promise.reject(new Error('db down')) },
      maxAgeSeconds: 60,
      onError,
    })

    await expect(fresh()).resolves.toBeUndefined()
    expect(onError).toHaveBeenCalledTimes(1)
  })
})
