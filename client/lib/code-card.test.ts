import { encode } from 'uqr'
import { describe, expect, it } from 'vitest'
import type { CardPalette, Pen } from '../recap/card'
import { paintCodeCard } from './code-card'

const palette: CardPalette = {
  paper: '#faf8f4',
  ink: '#111010',
  muted: '#6b6659',
  accent: '#d4471f',
  display: 'Anton',
  body: 'Archivo',
  mono: 'JetBrains Mono',
}

function recorder(): { pen: Pen; texts: string[]; inked: number } {
  const seen = { texts: [] as string[], inked: 0 }
  const pen = {
    fillStyle: '',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    fillRect(this: { fillStyle: string }) {
      if (this.fillStyle === palette.ink) seen.inked += 1
    },
    fillText: (text: string) => {
      seen.texts.push(text)
    },
    measureText: (text: string) => ({ width: text.length * 60 }),
    save: () => undefined,
    restore: () => undefined,
  } as unknown as Pen
  return {
    pen,
    texts: seen.texts,
    get inked() {
      return seen.inked
    },
  }
}

describe('the profile code card (R-CODE-2)', () => {
  it('draws the name, every dark module of the link’s code, and the app', () => {
    const link = 'https://rebel.test/p#t=abc'
    const drawn = recorder()

    paintCodeCard(
      drawn.pen,
      { name: 'Ada Lovelace', link, site: 'https://rebel.test' },
      palette,
      null,
    )

    const dark = encode(link, { border: 4 }).data.flat().filter(Boolean).length
    expect(drawn.texts).toEqual([
      'LET’S CONNECT',
      'Ada Lovelace',
      'Scan to see my card and ask to connect.',
      'REBEL MATCH',
      'https://rebel.test',
    ])
    expect(drawn.inked).toBe(dark)
    expect(drawn.texts.join(' ')).not.toContain('t=abc')
  })
})
