// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CardPalette } from '../recap/card'
import type { Invite } from './invites'

const painted = vi.hoisted(() => ({
  name: '',
  texts: [] as string[],
  images: [] as unknown[],
}))
vi.mock('./code-card', async (actual) => ({
  ...(await actual<typeof import('./code-card')>()),
  renderPng: (
    _size: unknown,
    name: string,
    paint: (pen: unknown, palette: CardPalette) => void,
  ) => {
    painted.name = name
    painted.texts = []
    painted.images = []
    const noop = (): undefined => undefined
    paint(
      {
        fillRect: noop,
        fillText: (text: string) => painted.texts.push(text),
        measureText: (text: string) => ({ width: text.length * 10 }),
        drawImage: (image: unknown) => painted.images.push(image),
        save: noop,
        restore: noop,
        translate: noop,
        scale: noop,
        rotate: noop,
        fill: noop,
        stroke: noop,
        setLineDash: noop,
      },
      {
        paper: '#fff',
        ink: '#000',
        muted: '#666',
        accent: '#d4471f',
        onAccent: '#fff',
        display: 'Anton',
        body: 'Archivo',
        mono: 'mono',
      },
    )
    return Promise.resolve(new File([], name))
  },
}))

const { renderInviteCard, sized } = await import('./invite-card')

const invite: Invite = {
  id: 'i-1',
  label: 'Summit 2026 — main stage',
  validFrom: '2026-11-08T09:00:00.000Z',
  validUntil: '2026-11-08T21:00:00.000Z',
  maxUses: 400,
  uses: 0,
  opens: 0,
  state: 'active',
  joinUrl: 'https://rebel.test/?invite=abc',
  createdBy: 'host@example.invalid',
  createdAt: '2026-11-08T08:00:00.000Z',
  eventBadge: null,
}
const badge = {
  id: 'b-1',
  name: 'Summit 2026',
  ticketLine: 'SUMMIT',
  bigLine: '2026',
  hasLogo: true,
}

class LoadedImage {
  src = ''
  naturalWidth = 64
  naturalHeight = 32
  decode = (): Promise<void> => Promise.resolve()
}

function serveLogo(svg: string, ok = true): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok, text: () => Promise.resolve(svg) })),
  )
  vi.stubGlobal('Image', LoadedImage)
  URL.createObjectURL = vi.fn(() => 'blob:logo')
  URL.revokeObjectURL = vi.fn()
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('an invite’s downloaded card (R-INV-9, R-INV-13)', () => {
  it('heads a card without a badge with the label, named for its format', async () => {
    const file = await renderInviteCard(invite, 'slides', 'https://rebel.test')

    expect(file.name).toBe('rebel-match-summit-2026-main-stage-slides.png')
    expect(painted.texts).toContain('Summit 2026 — main stage')
    expect(painted.images).toEqual([])
  })

  it('heads a card with a badge with its name, and draws its logo', async () => {
    serveLogo('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 32"/>')

    await renderInviteCard(
      { ...invite, eventBadge: badge },
      'social',
      'https://rebel.test',
    )

    expect(painted.name).toBe('rebel-match-summit-2026-main-stage-social.png')
    expect(painted.texts).toEqual(
      expect.arrayContaining(['Summit 2026', 'SUMMIT', '2026']),
    )
    expect(painted.texts).not.toContain('Summit 2026 — main stage')
    expect(painted.images).toHaveLength(1)
  })

  it('draws the flag instead when the logo cannot be had', async () => {
    serveLogo('', false)

    await renderInviteCard(
      { ...invite, eventBadge: badge },
      'social',
      'https://rebel.test',
    )

    expect(painted.images).toEqual([])
    expect(painted.texts).toContain('SUMMIT')
  })

  it('names a card whose label has no letters or digits “invite”', async () => {
    const file = await renderInviteCard(
      { ...invite, label: '— · —' },
      'slides',
      'https://rebel.test',
    )

    expect(file.name).toBe('rebel-match-invite-slides.png')
  })
})

describe('sizing a logo for the canvas', () => {
  it.each([
    ['0 0 64 32', '64', '32'],
    ['0,0,64,32', '64', '32'],
  ])('gives a logo with viewBox “%s” a size from it', (box, width, height) => {
    const svg = sized(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}"/>`,
    )

    expect([svg.getAttribute('width'), svg.getAttribute('height')]).toEqual([
      width,
      height,
    ])
  })

  it('keeps a size the logo already has', () => {
    const svg = sized(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="5" viewBox="0 0 64 32"/>',
    )

    expect(svg.getAttribute('width')).toBe('10')
  })

  it('gives none to a logo without a viewBox', () => {
    expect(
      sized('<svg xmlns="http://www.w3.org/2000/svg"/>').hasAttribute('width'),
    ).toBe(false)
  })
})
