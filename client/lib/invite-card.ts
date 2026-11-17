import {
  CARD_SIZE,
  markPath,
  paintFoot,
  paintHead,
  type CardPalette,
  type CardSize,
  type Pen,
} from '../recap/card'
import { CODE_LOOK, paintCaption, paintCode, renderPng } from './code-card'
import { logoUrl, type Invite } from './invites'
import {
  paintTicket,
  ticketPaths,
  type TicketFace,
  type TicketPaths,
  type TicketPen,
} from './ticket'

/** The shapes an invite's QR is downloaded in (R-INV-9): a 16:9 slide, or
 * the profile code card's portrait size for social media. */
export const INVITE_CARD_SIZES = {
  slides: { width: 1920, height: 1080 },
  social: CARD_SIZE,
} as const satisfies Record<string, CardSize>

export type InviteCardFormat = keyof typeof INVITE_CARD_SIZES

/** What an invite's card shows: its event, the QR of its join URL, the
 * badge joining earns, and where the app lives. */
export interface InviteCard {
  headline: string
  link: string
  site: string
  badge: TicketFace | null
}

const TITLE = 'Scan to join'
const CAPTION = {
  badge: 'Join and earn this badge.',
  plain: 'Join the movement on Rebel Match.',
}
const { margin } = CODE_LOOK
// Where the drawn part of the ticket starts on its grid, so it lines up
// with the margin.
const TICKET_INSET = 0.06

const slides = {
  qrSize: 900,
  ticketTop: 460,
  ticketSize: 320,
  captionGap: 40,
  plainCaptionTop: 520,
}
const social = { qrSize: 560, ticketSize: 340 }

type InvitePen = Pen & TicketPen

function captionOf(card: InviteCard): string {
  return card.badge === null ? CAPTION.plain : CAPTION.badge
}

// The slide: the words and the ticket on the left, the QR filling the
// right.
function paintSlide(
  pen: InvitePen,
  card: InviteCard,
  palette: CardPalette,
  paths: TicketPaths | null,
): void {
  const { width, height } = INVITE_CARD_SIZES.slides
  const qrLeft = width - margin - slides.qrSize
  paintHead(
    pen,
    { title: TITLE, name: card.headline },
    palette,
    qrLeft - 2 * margin,
  )
  paintCode(pen, card.link, palette, {
    left: qrLeft,
    top: (height - slides.qrSize) / 2,
    width: slides.qrSize,
    size: slides.qrSize,
  })
  let captionTop = slides.plainCaptionTop
  if (card.badge !== null) {
    paintTicket(pen, card.badge, palette, paths, {
      x: margin - slides.ticketSize * TICKET_INSET,
      y: slides.ticketTop,
      size: slides.ticketSize,
    })
    captionTop = slides.ticketTop + slides.ticketSize + slides.captionGap
  }
  paintCaption(pen, captionOf(card), palette, { x: margin, y: captionTop })
}

// The portrait card: the profile code card, with the ticket beside a
// smaller QR when the invite gives a badge.
function paintSocial(
  pen: InvitePen,
  card: InviteCard,
  palette: CardPalette,
  paths: TicketPaths | null,
): void {
  paintHead(pen, { title: TITLE, name: card.headline }, palette)
  let qrSize = CODE_LOOK.qrSize
  if (card.badge === null) paintCode(pen, card.link, palette)
  else {
    qrSize = social.qrSize
    paintCode(pen, card.link, palette, {
      left: margin,
      top: CODE_LOOK.qrTop,
      width: qrSize,
      size: qrSize,
    })
    paintTicket(pen, card.badge, palette, paths, {
      x: CARD_SIZE.width - margin - social.ticketSize * (1 - TICKET_INSET),
      y: CODE_LOOK.qrTop + (qrSize - social.ticketSize) / 2,
      size: social.ticketSize,
    })
  }
  paintCaption(pen, captionOf(card), palette, {
    x: margin,
    y: CODE_LOOK.qrTop + qrSize + CODE_LOOK.captionGap,
  })
}

/** Draws an invite as a card to show or post, in the profile code card's
 * look, with its event badge's ticket when it gives one (R-INV-9,
 * R-INV-13). */
export function paintInviteCard(
  pen: InvitePen,
  format: InviteCardFormat,
  card: InviteCard,
  palette: CardPalette,
  shapes: { r: Path2D | null; ticket: TicketPaths | null },
): void {
  const size = INVITE_CARD_SIZES[format]
  pen.fillStyle = palette.paper
  pen.fillRect(0, 0, size.width, size.height)
  if (format === 'slides') paintSlide(pen, card, palette, shapes.ticket)
  else paintSocial(pen, card, palette, shapes.ticket)
  paintFoot(pen, palette, card.site, shapes.r, size.height)
}

/** The SVG's markup, given a size from its viewBox when it has none. */
export function sized(text: string): Element {
  const svg = new DOMParser().parseFromString(
    text,
    'image/svg+xml',
  ).documentElement
  const [, , width = 0, height = 0] = (svg.getAttribute('viewBox') ?? '')
    .split(/[\s,]+/)
    .map(Number)
  if (!svg.hasAttribute('width') && width > 0 && height > 0) {
    svg.setAttribute('width', String(width))
    svg.setAttribute('height', String(height))
  }
  return svg
}

// The logo as an image the canvas can draw. An SVG with only a viewBox has
// no size of its own, and some browsers draw nothing of it, so it is given
// one from its viewBox first. Null when it cannot be had.
async function loadLogo(
  url: string,
): Promise<{ image: HTMLImageElement; aspect: number } | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const svg = sized(await response.text())
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], {
      type: 'image/svg+xml',
    })
    const image = new Image()
    image.src = URL.createObjectURL(blob)
    try {
      await image.decode()
    } finally {
      URL.revokeObjectURL(image.src)
    }
    if (image.naturalWidth === 0 || image.naturalHeight === 0) return null
    return { image, aspect: image.naturalWidth / image.naturalHeight }
  } catch {
    return null
  }
}

const slug = (label: string): string =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'invite'

/** An invite's card as a PNG file to download (R-INV-9). Its headline is
 * the event's badge, or the invite's label without one. */
export async function renderInviteCard(
  invite: Invite,
  format: InviteCardFormat,
  site: string,
): Promise<File> {
  const badge = invite.eventBadge
  const logo = badge?.hasLogo === true ? await loadLogo(logoUrl(badge)) : null
  const card: InviteCard = {
    headline: badge?.name ?? invite.label,
    link: invite.joinUrl,
    site,
    badge:
      badge === null
        ? null
        : {
            ticketLine: badge.ticketLine,
            bigLine: badge.bigLine,
            logo: logo?.image ?? null,
            logoAspect: logo?.aspect ?? 1,
          },
  }
  return renderPng(
    INVITE_CARD_SIZES[format],
    `rebel-match-${slug(invite.label)}-${format}.png`,
    (pen, palette) => {
      paintInviteCard(pen, format, card, palette, {
        r: markPath(),
        ticket: ticketPaths(),
      })
    },
  )
}
