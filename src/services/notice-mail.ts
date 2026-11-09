import { renderMail, type MailBlock, type RenderedMail } from './mail-layout.js'
import { noticeFooter, noticeLink } from './notice-link.js'
import type { NotificationKind } from './notifications.js'

/** What one notification's email says: its lead sentence, anything that
 * follows it, and the button to the screen at `path`; an aside closes it. */
export interface Notice {
  heading: string
  preview: string
  text: string
  blocks?: readonly MailBlock[]
  action: { label: string; prompt: string; path: string }
  aside?: string
}

/** A notification's email, its link marked with `kind` and its foot the one
 * every notice carries (R-MSG-8, R-ANA-1). */
export function renderNotice(
  publicUrl: string,
  kind: NotificationKind,
  notice: Notice,
): RenderedMail {
  const { label, prompt, path } = notice.action
  const aside: MailBlock[] =
    notice.aside === undefined ? [] : [{ kind: 'aside', text: notice.aside }]
  return renderMail({
    heading: notice.heading,
    preview: notice.preview,
    blocks: [
      { kind: 'paragraph', text: notice.text },
      ...(notice.blocks ?? []),
      {
        kind: 'action',
        action: { label, prompt, url: noticeLink(publicUrl, path, kind) },
      },
      ...aside,
    ],
    footer: noticeFooter(publicUrl),
  })
}
