/** How an image left the app (R-RECAP-7). */
export type SharedVia = 'share_sheet' | 'linkedin' | 'image'

/** What sharing needs of the browser, so a test can stand in for it. */
export interface ShareHost {
  canShare?: (data: ShareData) => boolean
  share?: (data: ShareData) => Promise<void>
  copy?: (text: string) => Promise<void>
  open: (url: string) => void
  save: (file: File) => void
}

/** LinkedIn's post composer with the text filled in. */
export const linkedInUrl = (text: string): string =>
  `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`

const browserHost = (): ShareHost => ({
  ...(typeof navigator.canShare === 'function'
    ? {
        canShare: (data) => navigator.canShare(data),
        share: (data) => navigator.share(data),
      }
    : {}),
  ...(typeof navigator.clipboard?.writeText === 'function'
    ? { copy: (text) => navigator.clipboard.writeText(text) }
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

/** Shares an image through the phone's share sheet, to LinkedIn, WhatsApp
 * or anywhere. The image goes alone, since apps such as LinkedIn drop an
 * image sent with text; the text is copied for pasting, in the same tap so
 * the sheet keeps its permission. Elsewhere it saves the image and opens
 * LinkedIn's composer with the text. Null when the member backed out. */
export async function shareImage(
  file: File,
  text: string,
  host: ShareHost = browserHost(),
): Promise<SharedVia | null> {
  const data: ShareData = { files: [file] }
  if (host.canShare?.(data) === true && host.share !== undefined) {
    void host.copy?.(text).catch(() => undefined)
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

/** Saves an image to the device. */
export function saveImage(
  file: File,
  host: ShareHost = browserHost(),
): SharedVia {
  host.save(file)
  return 'image'
}
