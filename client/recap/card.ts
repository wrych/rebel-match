import { RECAP_TITLE } from '../../src/recap/title'
import { MARK_APART, MARK_PLACE, MARK_R, MARK_SIZE } from '../lib/mark'
import type { Recap } from '../lib/recap'
import { paintHalo, type Halo, type HaloFrame, type HaloPen } from './halo'
import { countsOf } from './story'

export { RECAP_TITLE }

/** What the share card carries, and nothing else (R-RECAP-5): the member's
 * name, their figures with the highest level of each and the crown, where
 * they hold it. No other member, no challenge text, no network. */
export interface Card {
  title: string
  name: string
  figures: {
    count: number
    counts: string
    level: string | null
    crown: string | null
  }[]
}

export function cardOf(recap: Recap, name: string): Card {
  return {
    title: RECAP_TITLE,
    name,
    figures: recap.rows
      .filter((row) => row.count > 0)
      .map((row) => ({
        count: row.count,
        counts: countsOf(row),
        level: row.level,
        crown: row.crown.held ? row.crown.name : null,
      })),
  }
}

/** The ready-written post that goes with the card (R-RECAP-6). */
export function shareText(card: Card, site: string): string {
  const figures = card.figures.map(
    (figure) => `${String(figure.count)} ${figure.counts}`,
  )
  const crowns = card.figures.flatMap((figure) =>
    figure.crown === null ? [] : [figure.crown],
  )
  const lines = [
    `${card.title} from the Corporate Rebels summit:`,
    ...figures.map((figure) => `· ${figure}`),
    ...(crowns.length > 0 ? [`Crowned ${crowns.join(', ')}.`] : []),
    '',
    `Work can be better. Join the movement on Rebel Match: ${site}`,
  ]
  return lines.join('\n')
}

/** LinkedIn's post composer with the text filled in (R-RECAP-6). */
export const linkedInUrl = (text: string): string =>
  `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`

/** LinkedIn's portrait size. */
export const CARD_SIZE = { width: 1080, height: 1350 }

/** The colours the card is drawn in, from the app's own. */
export interface CardPalette {
  paper: string
  ink: string
  muted: string
  accent: string
  display: string
  body: string
  mono: string
}

const layout = {
  margin: 90,
  titleTop: 150,
  titleSize: 64,
  nameTop: 300,
  nameSize: 130,
  nameMinSize: 56,
  shrinkStep: 4,
  figuresTop: 400,
  figureHeight: 140,
  countSize: 120,
  labelSize: 40,
  levelSize: 30,
  countWidth: 220,
  markSize: 120,
  footSize: 30,
  rule: 8,
}

/** How the member's surroundings are framed, as the replay's own ending
 * frames them: their dot bottom right, the network's centre towards the
 * card's centre and a little past it, so the dots spread out (R-RECAP-5). */
export const HALO_FRAME: HaloFrame = {
  self: { x: 850, y: 1110 },
  toward: { x: CARD_SIZE.width / 2, y: CARD_SIZE.height / 2 },
  stretch: 1.25,
}
// Behind the words, the others stay faint enough to read through.
const HALO_STRENGTH = 0.4

/** The calls the card is drawn with: a canvas's 2D context, or a test's
 * stand-in. */
export type Pen = HaloPen &
  Pick<
    CanvasRenderingContext2D,
    | 'fillStyle'
    | 'font'
    | 'textAlign'
    | 'textBaseline'
    | 'globalCompositeOperation'
    | 'fillRect'
    | 'fillText'
    | 'measureText'
    | 'save'
    | 'restore'
    | 'translate'
    | 'scale'
    | 'fill'
  >

// The largest size up to `size` at which `text` fits `width`.
function fitted(
  pen: Pen,
  text: string,
  font: (size: number) => string,
  size: number,
  width: number,
): number {
  let at = size
  pen.font = font(at)
  while (at > layout.nameMinSize && pen.measureText(text).width > width) {
    at = Math.max(at - layout.shrinkStep, layout.nameMinSize)
    pen.font = font(at)
  }
  return at
}

function paintHead(pen: Pen, card: Card, palette: CardPalette): void {
  const { margin } = layout
  const width = CARD_SIZE.width - 2 * margin
  pen.fillStyle = palette.accent
  pen.fillRect(margin, margin, width, layout.rule)
  pen.textAlign = 'left'
  pen.textBaseline = 'alphabetic'
  pen.font = `${String(layout.titleSize)}px ${palette.display}`
  pen.fillText(card.title.toUpperCase(), margin, layout.titleTop + margin)
  pen.fillStyle = palette.ink
  const display = (size: number): string =>
    `${String(size)}px ${palette.display}`
  fitted(pen, card.name, display, layout.nameSize, width)
  pen.fillText(card.name, margin, layout.nameTop + margin)
}

function paintFigures(pen: Pen, card: Card, palette: CardPalette): void {
  const { margin } = layout
  let top = layout.figuresTop + margin
  for (const figure of card.figures) {
    pen.fillStyle = palette.accent
    pen.font = `${String(layout.countSize)}px ${palette.display}`
    pen.fillText(String(figure.count), margin, top + layout.countSize)
    pen.fillStyle = palette.ink
    pen.font = `700 ${String(layout.labelSize)}px ${palette.body}`
    const x = margin + layout.countWidth
    pen.fillText(figure.counts, x, top + layout.countSize / 2)
    const marks = [figure.level, figure.crown && `♛ ${figure.crown}`]
    const line = marks.filter((mark) => mark !== null).join(' · ')
    pen.fillStyle = figure.crown === null ? palette.muted : palette.accent
    pen.font = `${String(layout.levelSize)}px ${palette.mono}`
    pen.fillText(line.toUpperCase(), x, top + layout.countSize)
    top += layout.figureHeight
  }
}

// The mark as the header draws it at rest: two Rs, the right one mirrored
// and drawn by difference, on black (R-LOOK-5).
function paintMark(pen: Pen, r: Path2D, at: { x: number; y: number }): void {
  const scale = layout.markSize / MARK_SIZE
  pen.save()
  pen.translate(at.x, at.y)
  pen.scale(scale, scale)
  pen.fillStyle = '#000'
  pen.fillRect(0, 0, MARK_SIZE, MARK_SIZE)
  pen.fillStyle = '#fff'
  for (const side of [-1, 1]) {
    pen.save()
    if (side === 1) {
      pen.globalCompositeOperation = 'difference'
      pen.translate(MARK_SIZE - MARK_APART, 0)
      pen.scale(-1, 1)
    } else pen.translate(MARK_APART, 0)
    pen.translate(MARK_PLACE.x, MARK_PLACE.y)
    pen.scale(MARK_PLACE.scale, MARK_PLACE.scale)
    pen.fill(r, 'evenodd')
    pen.restore()
  }
  pen.restore()
}

function paintFoot(
  pen: Pen,
  palette: CardPalette,
  site: string,
  r: Path2D | null,
): void {
  const { margin, markSize } = layout
  const top = CARD_SIZE.height - margin - markSize
  if (r !== null) paintMark(pen, r, { x: margin, y: top })
  pen.fillStyle = palette.ink
  pen.font = `${String(layout.footSize * 2)}px ${palette.display}`
  pen.fillText(
    'REBEL MATCH',
    margin + markSize + margin / 3,
    top + markSize / 2,
  )
  pen.fillStyle = palette.muted
  pen.font = `${String(layout.footSize)}px ${palette.mono}`
  pen.fillText(site, margin + markSize + margin / 3, top + markSize - 8)
}

/** Draws the card, LinkedIn's portrait size, in the app's colours and type
 * (R-RECAP-5). `r` is the mark's R as a path, or null where none can be
 * made. */
export function paintCard(
  pen: Pen,
  card: Card,
  palette: CardPalette,
  site: string,
  r: Path2D | null,
  halo: Halo | null = null,
): void {
  paintGround(pen, palette, halo)
  paintWords(pen, card, palette, site, r)
}

/** The card's paper and, in its corner, the member's surroundings: what
 * changes as the view turns. Under the words, so a faint dot never hides a
 * letter. */
export function paintGround(
  pen: Pen,
  palette: CardPalette,
  halo: Halo | null,
): void {
  pen.fillStyle = palette.paper
  pen.fillRect(0, 0, CARD_SIZE.width, CARD_SIZE.height)
  if (halo !== null)
    paintHalo(pen, halo, CARD_SIZE.width, {
      accent: palette.accent,
      ink: palette.ink,
      paper: palette.paper,
      strength: HALO_STRENGTH,
    })
}

/** Everything on the card that stays still: the words and the mark. */
export function paintWords(
  pen: Pen,
  card: Card,
  palette: CardPalette,
  site: string,
  r: Path2D | null,
): void {
  paintHead(pen, card, palette)
  paintFigures(pen, card, palette)
  paintFoot(pen, palette, site, r)
}

/** The mark's R as the card draws it. */
export const markPath = (): Path2D | null =>
  typeof Path2D === 'undefined' ? null : new Path2D(MARK_R)
