import { encode } from 'uqr'
import { describe, expect, it } from 'vitest'
import type { CardPalette } from '../recap/card'
import { paintInviteCard, type InviteCard } from './invite-card'

const palette: CardPalette = {
  paper: '#faf8f4',
  ink: '#111010',
  muted: '#6b6659',
  accent: '#d4471f',
  onAccent: '#fff',
  display: 'Anton',
  body: 'Archivo',
  mono: 'JetBrains Mono',
}

interface Seen {
  texts: string[]
  inked: { x: number; y: number; size: number }[]
  images: number
}

function recorder(): {
  pen: Parameters<typeof paintInviteCard>[0]
  seen: Seen
} {
  const seen: Seen = { texts: [], inked: [], images: 0 }
  const noop = (): undefined => undefined
  const pen = {
    fillStyle: '',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    fillRect(this: { fillStyle: string }, x: number, y: number, w: number) {
      if (this.fillStyle === palette.ink) seen.inked.push({ x, y, size: w })
    },
    fillText: (text: string) => {
      seen.texts.push(text)
    },
    measureText: (text: string) => ({ width: text.length * 60 }),
    drawImage: () => {
      seen.images += 1
    },
    save: noop,
    restore: noop,
    translate: noop,
    scale: noop,
    rotate: noop,
    fill: noop,
    stroke: noop,
    setLineDash: noop,
  } as unknown as Parameters<typeof paintInviteCard>[0]
  return { pen, seen }
}

const link = 'https://rebel.test/?invite=abc'
const plain: InviteCard = {
  headline: 'Main stage',
  link,
  site: 'https://rebel.test',
  badge: null,
}
const badged: InviteCard = {
  ...plain,
  headline: 'Summit 2026',
  badge: {
    ticketLine: 'SUMMIT',
    bigLine: '2026',
    logo: {} as CanvasImageSource,
    logoAspect: 2,
  },
}
const dark = encode(link, { border: 4 }).data.flat().filter(Boolean).length
const shapes = { r: null, ticket: null }

describe('the invite card (R-INV-9, R-INV-13)', () => {
  it('draws for social media as the profile code card does, without a badge', () => {
    const { pen, seen } = recorder()

    paintInviteCard(pen, 'social', plain, palette, shapes)

    expect(seen.texts).toEqual([
      'SCAN TO JOIN',
      'Main stage',
      'Join the movement on Rebel Match.',
      'REBEL MATCH',
      'https://rebel.test',
    ])
    expect(seen.inked).toHaveLength(dark)
    expect(seen.texts.join(' ')).not.toContain('invite=abc')
  })

  for (const format of ['social', 'slides'] as const)
    it(`carries the event badge's ticket and logo ${format === 'social' ? 'for social media' : 'on a slide'}`, () => {
      const { pen, seen } = recorder()

      paintInviteCard(pen, format, badged, palette, shapes)

      expect(seen.texts).toEqual([
        'SCAN TO JOIN',
        'Summit 2026',
        'SUMMIT',
        '2026',
        'Join and earn this badge.',
        'REBEL MATCH',
        'https://rebel.test',
      ])
      expect(seen.inked).toHaveLength(dark)
      expect(seen.images).toBe(1)
    })

  it('puts the QR on the right of a slide, clear of the words', () => {
    const { pen, seen } = recorder()

    paintInviteCard(pen, 'slides', plain, palette, shapes)

    const left = Math.min(...seen.inked.map((cell) => cell.x))
    const right = Math.max(...seen.inked.map((cell) => cell.x + cell.size))
    expect(left).toBeGreaterThan(1920 / 2 - 90)
    expect(right).toBeLessThanOrEqual(1920 - 90)
  })
})
