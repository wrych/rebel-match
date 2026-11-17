import { describe, expect, it } from 'vitest'
import type { CardPalette } from '../recap/card'
import { paintTicket, type TicketPaths, type TicketPen } from './ticket'

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
const paths = {
  stub: 'stub',
  panel: 'panel',
  flag: 'flag',
  perforation: 'perforation',
} as unknown as TicketPaths

function strokes(logo: boolean): Record<string, string> {
  const seen: Record<string, string> = {}
  const noop = (): undefined => undefined
  const pen = {
    lineCap: 'butt',
    save: noop,
    restore: noop,
    translate: noop,
    scale: noop,
    rotate: noop,
    fill: noop,
    setLineDash: noop,
    fillText: noop,
    drawImage: noop,
    stroke(this: { lineCap: string }, path: string) {
      seen[path] = this.lineCap
    },
  } as unknown as TicketPen
  paintTicket(
    pen,
    {
      ticketLine: 'SUMMIT',
      bigLine: '2026',
      logo: logo ? ({} as CanvasImageSource) : null,
      logoAspect: 1,
    },
    palette,
    paths,
    { x: 0, y: 0, size: 300 },
  )
  return seen
}

describe('the painted ticket (R-INV-13)', () => {
  it('rounds only the flag, as EventTicket draws it', () => {
    expect(strokes(false)).toEqual({
      stub: 'butt',
      panel: 'butt',
      flag: 'round',
      perforation: 'butt',
    })
  })

  it('draws no flag where there is a logo', () => {
    expect(strokes(true)).not.toHaveProperty('flag')
  })
})
