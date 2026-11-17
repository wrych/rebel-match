import { encode } from 'uqr'
import {
  CARD_SIZE,
  type CardSize,
  markPath,
  paintFoot,
  paintHead,
  type CardPalette,
  type Pen,
} from '../recap/card'
import { cardCanvas, cardPalette } from '../recap/share'

/** What a profile code's image shows: whose it is and where it leads. */
export interface CodeCard {
  name: string
  link: string
  site: string
}

const QUIET_ZONE = 4
/** Where a code card puts its QR and the line under it. */
export const CODE_LOOK = {
  margin: 90,
  qrTop: 430,
  qrSize: 600,
  captionGap: 70,
  captionSize: 36,
}
const look = CODE_LOOK

/** The QR drawn as the screen draws it: dark modules on the paper, with
 * its quiet zone, each module whole pixels so no seam shows between them.
 * It fills at most `box.size` square, centred across `box.width`. */
export function paintCode(
  pen: Pen,
  link: string,
  palette: CardPalette,
  box: { left: number; top: number; width: number; size: number } = {
    left: 0,
    top: look.qrTop,
    width: CARD_SIZE.width,
    size: look.qrSize,
  },
): void {
  const { data, size } = encode(link, { border: QUIET_ZONE })
  const cell = Math.floor(box.size / size)
  const drawn = cell * size
  const left = box.left + Math.round((box.width - drawn) / 2)
  pen.fillStyle = palette.paper
  pen.fillRect(left, box.top, drawn, drawn)
  pen.fillStyle = palette.ink
  data.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) pen.fillRect(left + x * cell, box.top + y * cell, cell, cell)
    })
  })
}

/** A code card's line under its QR, in the muted body type. */
export function paintCaption(
  pen: Pen,
  text: string,
  palette: CardPalette,
  at: { x: number; y: number },
): void {
  pen.fillStyle = palette.muted
  pen.textAlign = 'left'
  pen.font = `${String(look.captionSize)}px ${palette.body}`
  pen.fillText(text, at.x, at.y)
}

/** Draws a profile code as a shareable card, LinkedIn's portrait size, in
 * the recap card's look: the name, the QR of its link, a line on what it
 * does, and the app's mark (R-CODE-2). */
export function paintCodeCard(
  pen: Pen,
  card: CodeCard,
  palette: CardPalette,
  r: Path2D | null,
): void {
  pen.fillStyle = palette.paper
  pen.fillRect(0, 0, CARD_SIZE.width, CARD_SIZE.height)
  paintHead(pen, { title: 'Let’s connect', name: card.name }, palette)
  paintCode(pen, card.link, palette)
  paintCaption(pen, 'Scan to see my card and ask to connect.', palette, {
    x: look.margin,
    y: look.qrTop + look.qrSize + look.captionGap,
  })
  paintFoot(pen, palette, card.site, r)
}

const CODE_FILE = 'rebel-match-code.png'

/** A card painted on a canvas of `size`, in the page's palette, as a PNG
 * file named `name`. */
export async function renderPng(
  size: CardSize,
  name: string,
  paint: (pen: CanvasRenderingContext2D, palette: CardPalette) => void,
): Promise<File> {
  const palette = await cardPalette()
  const { canvas, pen } = cardCanvas(size)
  paint(pen, palette)
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png')
  })
  if (blob === null) throw new Error('code card unavailable')
  return new File([blob], name, { type: 'image/png' })
}

/** The profile code's card as a PNG file, for the share sheet. */
export function renderCodeCard(card: CodeCard): Promise<File> {
  return renderPng(CARD_SIZE, CODE_FILE, (pen, palette) => {
    paintCodeCard(pen, card, palette, markPath())
  })
}
