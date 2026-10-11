import { beforeEach, describe, expect, it, vi } from 'vitest'

async function freshIntro(): Promise<typeof import('./intro')> {
  vi.resetModules()
  return import('./intro')
}

describe('takeIntro (R-LOOK-5)', () => {
  let intro: typeof import('./intro')

  beforeEach(async () => {
    intro = await freshIntro()
  })

  it('plays the first time in a page load', () => {
    expect(intro.takeIntro(false)).toBe(true)
  })

  it('plays only once per page load', () => {
    intro.takeIntro(false)

    expect(intro.takeIntro(false)).toBe(false)
  })

  it('never plays for a member who prefers reduced motion', () => {
    expect(intro.takeIntro(true)).toBe(false)
  })
})
