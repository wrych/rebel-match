// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { router } from './router'

function signedOut(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({ ok: false, status: 401, json: async () => ({}) }),
    ),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('router titles (R-NAV-13)', () => {
  it('names the screen in the tab after each navigation', async () => {
    signedOut()

    await router.push('/privacy')
    expect(document.title).toBe('Privacy notice | Rebel Match')

    await router.push('/terms')
    expect(document.title).toBe('Terms of use | Rebel Match')
  })

  it('names an address no screen serves as not found', async () => {
    signedOut()

    await router.push('/no-such-screen')

    expect(document.title).toBe('Not found | Rebel Match')
  })
})
