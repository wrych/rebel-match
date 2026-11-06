import { encode } from 'uqr'
import {
  CARD_SIZE,
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
const look = {
  margin: 90,
  qrTop: 430,
  qrSize: 600,
  captionGap: 70,
  captionSize: 36,
}

/** The QR drawn as the screen draws it: dark modules on the paper, with
 * its quiet zone, each module whole pixels so no seam shows between them. */
function paintCode(pen: Pen, link: string, palette: CardPalette): void {
  const { data, size } = encode(link, { border: QUIET_ZONE })
  const cell = Math.floor(look.qrSize / size)
  const drawn = cell * size
  const left = Math.round((CARD_SIZE.width - drawn) / 2)
  pen.fillStyle = palette.paper
  pen.fillRect(left, look.qrTop, drawn, drawn)
  pen.fillStyle = palette.ink
  data.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) pen.fillRect(left + x * cell, look.qrTop + y * cell, cell, cell)
    })
  })
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
  pen.fillStyle = palette.muted
  pen.textAlign = 'left'
  pen.font = `${String(look.captionSize)}px ${palette.body}`
  pen.fillText(
    'Scan to see my card and ask to connect.',
    look.margin,
    look.qrTop + look.qrSize + look.captionGap,
  )
  paintFoot(pen, palette, card.site, r)
}

const CODE_FILE = 'rebel-match-code.png'

/** The profile code's card as a PNG file, for the share sheet. */
export async function renderCodeCard(card: CodeCard): Promise<File> {
  const palette = await cardPalette()
  const { canvas, pen } = cardCanvas()
  paintCodeCard(pen, card, palette, markPath())
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png')
  })
  if (blob === null) throw new Error('code card unavailable')
  return new File([blob], CODE_FILE, { type: 'image/png' })
}
