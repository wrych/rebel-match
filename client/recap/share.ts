import {
  CARD_SIZE,
  linkedInUrl,
  markPath,
  paintCard,
  type Card,
  type CardPalette,
} from './card'

/** How a card left the app, as `recap_shared` reports it (R-RECAP-7). */
export type SharedVia = 'share_sheet' | 'linkedin' | 'image'

/** What sharing needs of the browser, so a test can stand in for it. */
export interface ShareHost {
  canShare?: (data: ShareData) => boolean
  share?: (data: ShareData) => Promise<void>
  open: (url: string) => void
  save: (file: File) => void
}

export const CARD_FILE = 'rebel-record.png'

const browserHost = (): ShareHost => ({
  ...(typeof navigator.canShare === 'function'
    ? {
        canShare: (data) => navigator.canShare(data),
        share: (data) => navigator.share(data),
      }
    : {}),
  open: (url) => {
    window.open(url, '_blank', 'noopener')
  },
  save: (file) => {
    const link = document.createElement('a')
    link.href = URL.createObjectURL(file)
    link.download = file.name
    link.click()
    URL.revokeObjectURL(link.href)
  },
})

const aborted = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError'

/** Shares the card, LinkedIn first (R-RECAP-6): to the phone's share sheet
 * where it takes an image, else saved and LinkedIn's composer opened with
 * the post for the member to attach it. Null when the member backed out. */
export async function shareCard(
  file: File,
  text: string,
  host: ShareHost = browserHost(),
): Promise<SharedVia | null> {
  const data: ShareData = { files: [file], text }
  if (host.canShare?.(data) === true && host.share !== undefined) {
    try {
      await host.share(data)
      return 'share_sheet'
    } catch (error) {
      if (aborted(error)) return null
    }
  }
  host.save(file)
  host.open(linkedInUrl(text))
  return 'linkedin'
}

/** Saves the card as an image (R-RECAP-6). */
export function saveCard(
  file: File,
  host: ShareHost = browserHost(),
): SharedVia {
  host.save(file)
  return 'image'
}

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

/** Draws the card on a canvas, once its fonts are in, as a PNG file
 * (R-RECAP-5). */
export async function renderCard(card: Card, site: string): Promise<File> {
  const palette = paletteOfPage(document.documentElement)
  // A font that will not load still leaves the card drawn, in a fallback.
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
  const canvas = document.createElement('canvas')
  canvas.width = CARD_SIZE.width
  canvas.height = CARD_SIZE.height
  const pen = canvas.getContext('2d')
  if (pen === null) throw new Error('card unavailable')
  paintCard(pen, card, palette, site, markPath())
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png')
  })
  if (blob === null) throw new Error('card unavailable')
  return new File([blob], CARD_FILE, { type: 'image/png' })
}
