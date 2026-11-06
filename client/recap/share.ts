import {
  CARD_SIZE,
  markPath,
  paintCard,
  type Card,
  type CardPalette,
  type Pen,
} from './card'
import type { Halo } from './halo'

const CARD_FILE = 'rebel-record.png'

/** The app's own colours and type, read from the page. */
export function paletteOfPage(element: Element): CardPalette {
  const style = getComputedStyle(element)
  const read = (name: string, fallback: string): string =>
    style.getPropertyValue(name).trim() || fallback
  return {
    paper: read('--paper', '#faf8f4'),
    ink: read('--ink', '#111010'),
    muted: read('--muted', '#6b6659'),
    accent: read('--accent', '#d4471f'),
    display: read('--font-display', 'Anton, sans-serif'),
    body: read('--font-body', 'Archivo, sans-serif'),
    mono: read('--font-mono', 'monospace'),
  }
}

/** The page's palette once the card's fonts are in; a font that will not
 * load still leaves the card drawn, in a fallback. */
export async function cardPalette(): Promise<CardPalette> {
  const palette = paletteOfPage(document.documentElement)
  await Promise.all(
    [
      `40px ${palette.display}`,
      `700 40px ${palette.body}`,
      `40px ${palette.mono}`,
    ].map((font) =>
      Promise.resolve()
        .then(() => document.fonts.load(font))
        .catch(() => []),
    ),
  )
  return palette
}

/** A canvas the card's size, and its pen. */
export function cardCanvas(): { canvas: HTMLCanvasElement; pen: Pen } {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_SIZE.width
  canvas.height = CARD_SIZE.height
  const pen = canvas.getContext('2d')
  if (pen === null) throw new Error('card unavailable')
  return { canvas, pen }
}

/** Draws the card, its surroundings still, as a PNG file (R-RECAP-5). */
export async function renderCard(
  card: Card,
  site: string,
  halo: Halo | null = null,
): Promise<File> {
  const palette = await cardPalette()
  const { canvas, pen } = cardCanvas()
  paintCard(pen, card, palette, site, markPath(), halo)
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png')
  })
  if (blob === null) throw new Error('card unavailable')
  return new File([blob], CARD_FILE, { type: 'image/png' })
}
