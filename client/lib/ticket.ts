import type { CardPalette } from '../recap/card'

/** The event badge's ticket, on a 100 by 100 grid, as `EventTicket` draws
 * it and an invite's card paints it (R-INV-13). */
export const TICKET = {
  grid: 100,
  tilt: -7,
  stub: 'M12 24 H88 a6 6 0 0 1 6 6 V42 a8 8 0 0 0 0 16 V70 a6 6 0 0 1 -6 6 H12 a6 6 0 0 1 -6 -6 V58 a8 8 0 0 0 0 -16 V30 a6 6 0 0 1 6 -6 Z',
  panel:
    'M18 34 H36 a6 6 0 0 1 6 6 V60 a6 6 0 0 1 -6 6 H18 a6 6 0 0 1 -6 -6 V40 a6 6 0 0 1 6 -6 Z',
  logo: { x: 15, y: 37, width: 24, height: 26 },
  flag: 'M21 61 V40 M21 40 H32 L29.5 44.5 L32 49 H21',
  perforation: 'M48 29 V71',
  dash: 3,
  smallLine: { x: 71, y: 47, size: 8.5, spacing: 0.8 },
  bigLine: { x: 71, y: 68, size: 20 },
  strokes: { stub: 3, panel: 1.5, flag: 2.2, perforation: 1.5 },
} as const

/** The ticket's outlines as paths, or null where none can be made. */
export interface TicketPaths {
  stub: Path2D
  panel: Path2D
  flag: Path2D
  perforation: Path2D
}

export const ticketPaths = (): TicketPaths | null =>
  typeof Path2D === 'undefined'
    ? null
    : {
        stub: new Path2D(TICKET.stub),
        panel: new Path2D(TICKET.panel),
        flag: new Path2D(TICKET.flag),
        perforation: new Path2D(TICKET.perforation),
      }

/** What a ticket shows: its two lines, and its logo once loaded. */
export interface TicketFace {
  ticketLine: string
  bigLine: string
  logo: CanvasImageSource | null
  /** The logo's own width over its height. */
  logoAspect: number
}

/** The calls the ticket is painted with. */
export type TicketPen = Pick<
  CanvasRenderingContext2D,
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'lineJoin'
  | 'lineCap'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
  | 'save'
  | 'restore'
  | 'translate'
  | 'scale'
  | 'rotate'
  | 'fill'
  | 'stroke'
  | 'setLineDash'
  | 'fillText'
  | 'drawImage'
>

// Where an image of `aspect` sits in the logo's box, whole and centred, as
// the ticket's `preserveAspectRatio="xMidYMid meet"` places it.
function fittedLogo(aspect: number): {
  x: number
  y: number
  width: number
  height: number
} {
  const box = TICKET.logo
  const width = Math.min(box.width, box.height * aspect)
  const height = width / aspect
  return {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
  }
}

// The stub, the logo's panel, the flag where there is no logo, and the
// perforation.
function paintOutlines(
  pen: TicketPen,
  paths: TicketPaths,
  palette: CardPalette,
  hasLogo: boolean,
): void {
  pen.fillStyle = palette.accent
  pen.strokeStyle = palette.ink
  pen.lineWidth = TICKET.strokes.stub
  pen.fill(paths.stub)
  pen.stroke(paths.stub)
  pen.fillStyle = palette.paper
  pen.lineWidth = TICKET.strokes.panel
  pen.fill(paths.panel)
  pen.stroke(paths.panel)
  if (!hasLogo) {
    pen.lineWidth = TICKET.strokes.flag
    pen.lineCap = 'round'
    pen.stroke(paths.flag)
    pen.lineCap = 'butt'
  }
  pen.strokeStyle = palette.onAccent
  pen.lineWidth = TICKET.strokes.perforation
  pen.setLineDash([TICKET.dash, TICKET.dash])
  pen.stroke(paths.perforation)
  pen.setLineDash([])
}

/** Paints the ticket `size` pixels square with its top left at `at`, in
 * the card's colours (R-INV-13). */
export function paintTicket(
  pen: TicketPen,
  face: TicketFace,
  palette: CardPalette,
  paths: TicketPaths | null,
  at: { x: number; y: number; size: number },
): void {
  const middle = TICKET.grid / 2
  pen.save()
  pen.translate(at.x, at.y)
  pen.scale(at.size / TICKET.grid, at.size / TICKET.grid)
  pen.translate(middle, middle)
  pen.rotate((TICKET.tilt * Math.PI) / 180)
  pen.translate(-middle, -middle)
  pen.lineJoin = 'round'
  if (paths !== null) paintOutlines(pen, paths, palette, face.logo !== null)
  if (face.logo !== null) {
    const box = fittedLogo(face.logoAspect)
    pen.drawImage(face.logo, box.x, box.y, box.width, box.height)
  }
  pen.fillStyle = palette.onAccent
  pen.textAlign = 'center'
  pen.textBaseline = 'alphabetic'
  const small = TICKET.smallLine
  pen.font = `700 ${String(small.size)}px ${palette.mono}`
  if ('letterSpacing' in pen) pen.letterSpacing = `${String(small.spacing)}px`
  pen.fillText(face.ticketLine, small.x, small.y)
  const big = TICKET.bigLine
  pen.font = `${String(big.size)}px ${palette.display}`
  pen.fillText(face.bigLine, big.x, big.y)
  pen.restore()
}
