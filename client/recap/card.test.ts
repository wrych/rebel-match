import { describe, expect, it } from 'vitest'
import type { Recap, RecapRow } from '../lib/recap'
import {
  cardOf,
  linkedInUrl,
  paintCard,
  RECAP_TITLE,
  shareText,
  type CardPalette,
  type Pen,
} from './card'

const row = (
  name: RecapRow['row'],
  count: number,
  extra: Partial<RecapRow> = {},
): RecapRow => ({
  row: name,
  count,
  level: null,
  crown: { name: `${name} crown`, held: false },
  below: 90,
  ...extra,
})

const recap: Recap = {
  joined: '2026-09-02',
  members: 40,
  rows: [
    row('speak', 3, {
      level: 'Agitator',
      crown: { name: 'Ringleader', held: true },
    }),
    row('help', 0),
    row('connect', 1, { level: 'Co-conspirator' }),
  ],
  timeline: { nodes: [], links: [], moons: [], own: null },
}

const palette: CardPalette = {
  paper: '#faf8f4',
  ink: '#111010',
  muted: '#6b6659',
  accent: '#d4471f',
  display: 'Anton',
  body: 'Archivo',
  mono: 'JetBrains Mono',
}

function recorder(): { pen: Pen; texts: string[] } {
  const texts: string[] = []
  const pen = {
    fillStyle: '',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    globalCompositeOperation: 'source-over',
    fillRect: () => undefined,
    fillText: (text: string) => {
      texts.push(text)
    },
    measureText: (text: string) => ({ width: text.length * 60 }),
    save: () => undefined,
    restore: () => undefined,
    translate: () => undefined,
    scale: () => undefined,
    fill: () => undefined,
  } as unknown as Pen
  return { pen, texts }
}

describe('the share card (R-RECAP-5, R-RECAP-6)', () => {
  it('carries the name and the figures above zero, crowns with their row', () => {
    expect(cardOf(recap, 'Ada Rebel')).toEqual({
      title: RECAP_TITLE,
      name: 'Ada Rebel',
      figures: [
        {
          count: 3,
          counts: 'challenges posted',
          level: 'Agitator',
          crown: 'Ringleader',
        },
        {
          count: 1,
          counts: 'person connected',
          level: 'Co-conspirator',
          crown: null,
        },
      ],
    })
  })

  it('draws only what the card carries', () => {
    const { pen, texts } = recorder()

    paintCard(pen, cardOf(recap, 'Ada Rebel'), palette, 'rebel.test', null)

    expect(texts).toEqual([
      RECAP_TITLE.toUpperCase(),
      'Ada Rebel',
      '3',
      'challenges posted',
      'AGITATOR · ♛ RINGLEADER',
      '1',
      'person connected',
      'CO-CONSPIRATOR',
      'REBEL MATCH',
      'rebel.test',
    ])
  })

  it('shrinks a long name to fit', () => {
    const { pen } = recorder()
    const fonts: string[] = []
    const watched = new Proxy(pen, {
      set(target, key, value: unknown) {
        if (key === 'font') fonts.push(String(value))
        return Reflect.set(target, key, value)
      },
    })

    paintCard(
      watched,
      cardOf(recap, 'Maximiliana Rebellious-Longname'),
      palette,
      'rebel.test',
      null,
    )

    expect(fonts).toContain('56px Anton')
  })

  it('writes a post naming the figures and the crowns', () => {
    const text = shareText(cardOf(recap, 'Ada'), 'https://rebel.test')

    expect(text).toContain('3 challenges posted')
    expect(text).toContain('1 person connected')
    expect(text).toContain('Crowned Ringleader.')
    expect(text).toContain('https://rebel.test')
    expect(text).not.toContain('Ada')
  })

  it('opens LinkedIn’s composer with the post filled in', () => {
    expect(linkedInUrl('a & b')).toBe(
      'https://www.linkedin.com/feed/?shareActive=true&text=a%20%26%20b',
    )
  })
})
