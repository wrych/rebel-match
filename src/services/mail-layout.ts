/** Where a reader goes next: the button's words, and the sentence that leads
 * to the link in plain text. `spelled` writes the link out in the HTML too. */
export interface MailAction {
  label: string
  url: string
  prompt?: string
  spelled?: boolean
}

/** One part of an email's body, in reading order. A quote is a member's own
 * words; an aside is the small print under a rule. */
export type MailBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'action'; action: MailAction }
  | { kind: 'aside'; text: string }

/** One entry of a digest: what happened, the note it carries, its link. */
export interface MailItem {
  text: string
  quote?: string
  action: MailAction
}

/** An email described once, rendered as both plain text and HTML (R-MSG-8,
 * ADR 0054). `settings` is where a member chooses how notifications reach
 * them. */
export interface MailContent {
  heading: string
  preview: string
  blocks: readonly MailBlock[]
  items?: readonly MailItem[]
  footer: { reason: string; settings?: string }
}

/** The two parts of an email. */
export interface RenderedMail {
  text: string
  html: string
}

/** How the HTML part refers to the RR mark the message carries. */
export const LOGO_CID = 'rr-mark'

const SETTINGS_PROMPT =
  'Choose how each kind of notification reaches you on your profile:'
const SETTINGS_LABEL = 'Choose how notifications reach you'
const PASTE_PROMPT = 'Or paste this link into your browser:'
const ITEM_QUOTE = 'They wrote: '

const colour = {
  paper: '#faf8f4',
  card: '#ffffff',
  ink: '#111010',
  inkSoft: '#3b3830',
  muted: '#6b6659',
  faint: '#8a8579',
  line: '#ded8cc',
  accent: '#d4471f',
  onAccent: '#ffffff',
}
const font = {
  display: "Anton, Impact, 'Arial Narrow Bold', sans-serif",
  body: 'Archivo, Helvetica, Arial, sans-serif',
  mono: "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace",
}

function blockText(block: MailBlock): string {
  if (block.kind !== 'action') return block.text
  const { prompt, url } = block.action
  return prompt === undefined ? url : `${prompt}\n${url}`
}

function itemText(item: MailItem): string {
  const quote = item.quote === undefined ? [] : [`${ITEM_QUOTE}${item.quote}`]
  return [item.text, ...quote, item.action.url].join('\n')
}

function footerText(footer: MailContent['footer']): string[] {
  return footer.settings === undefined
    ? [footer.reason]
    : [footer.reason, `${SETTINGS_PROMPT}\n${footer.settings}`]
}

function renderText(content: MailContent): string {
  const parts = [
    ...content.blocks.map(blockText),
    ...(content.items ?? []).map(itemText),
    ...footerText(content.footer),
  ]
  return `${parts.join('\n\n')}\n`
}

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** The text made safe to place in HTML, as content or as an attribute. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char)
}

const lines = (text: string): string =>
  escapeHtml(text).replace(/\r?\n/g, '<br>')

function button(action: MailAction): string {
  const url = escapeHtml(action.url)
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr>` +
    `<td style="border-radius:8px;background:${colour.accent};">` +
    `<a href="${url}" style="display:inline-block;padding:14px 28px;font-family:${font.body};font-size:16px;font-weight:bold;color:${colour.onAccent};text-decoration:none;border-radius:8px;">${escapeHtml(action.label)}</a>` +
    `</td></tr></table>` +
    (action.spelled === true ? spelledLink(url) : '')
  )
}

function spelledLink(url: string): string {
  return (
    `<p class="rm-muted" style="margin:0 0 6px;font-size:13px;color:${colour.muted};">${PASTE_PROMPT}</p>` +
    `<p style="margin:0 0 24px;font-family:${font.mono};font-size:12px;line-height:1.5;word-break:break-all;"><a href="${url}" style="color:${colour.accent};">${url}</a></p>`
  )
}

function quote(text: string, size: number): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr>` +
    `<td class="rm-quote" style="background:${colour.paper};border-left:3px solid ${colour.accent};padding:12px 16px;font-size:${String(size)}px;line-height:1.55;color:${colour.inkSoft};">${lines(text)}</td>` +
    `</tr></table>`
  )
}

function blockHtml(block: MailBlock): string {
  switch (block.kind) {
    case 'paragraph':
      return `<p class="rm-ink" style="margin:0 0 16px;font-size:16px;line-height:1.55;color:${colour.ink};">${lines(block.text)}</p>`
    case 'quote':
      return quote(block.text, 15)
    case 'action':
      return button(block.action)
    case 'aside':
      return `<p class="rm-muted rm-line" style="margin:8px 0 0;padding-top:20px;border-top:1px solid ${colour.line};font-size:13px;line-height:1.5;color:${colour.muted};">${lines(block.text)}</p>`
  }
}

function itemHtml(item: MailItem): string {
  return (
    `<tr><td class="rm-line" style="padding:18px 0 2px;border-top:1px solid ${colour.line};">` +
    `<p class="rm-ink" style="margin:0 0 10px;font-size:16px;line-height:1.45;color:${colour.ink};">${lines(item.text)}</p>` +
    (item.quote === undefined ? '' : quote(item.quote, 14)) +
    `<p style="margin:0 0 16px;"><a href="${escapeHtml(item.action.url)}" style="font-size:14px;font-weight:bold;color:${colour.accent};text-decoration:none;">${escapeHtml(item.action.label)} &rarr;</a></p>` +
    `</td></tr>`
  )
}

function itemsHtml(items: readonly MailItem[] | undefined): string {
  return items === undefined || items.length === 0
    ? ''
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items.map(itemHtml).join('')}</table>`
}

function footerHtml(footer: MailContent['footer']): string {
  const settings =
    footer.settings === undefined
      ? ''
      : ` <a href="${escapeHtml(footer.settings)}" style="color:${colour.muted};">${SETTINGS_LABEL}</a>.`
  return `<td class="rm-muted" style="padding:20px 4px 0;font-family:${font.body};font-size:12px;line-height:1.5;color:${colour.faint};">${escapeHtml(footer.reason)}${settings}</td>`
}

const masthead =
  `<td style="padding:0 4px 20px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>` +
  `<td style="padding-right:12px;"><img src="cid:${LOGO_CID}" width="40" height="40" alt="" style="display:block;border:0;border-radius:7px;"></td>` +
  `<td class="rm-ink" style="font-family:${font.display};font-size:22px;letter-spacing:.04em;text-transform:uppercase;color:${colour.ink};">Rebel Match</td>` +
  `</tr></table></td>`

const darkScheme =
  '@media (prefers-color-scheme: dark) {' +
  '.rm-paper { background:#171614 !important; }' +
  '.rm-card { background:#211f1c !important; border-color:#3b3830 !important; }' +
  '.rm-ink { color:#f1ede6 !important; }' +
  '.rm-muted { color:#a8a294 !important; }' +
  '.rm-line { border-color:#3b3830 !important; }' +
  '.rm-quote { background:#2a2724 !important; color:#e5e0d6 !important; }' +
  '}'

function card(content: MailContent): string {
  return (
    `<td class="rm-card" style="background:${colour.card};border:1.5px solid ${colour.line};border-radius:12px;padding:32px 28px;font-family:${font.body};">` +
    `<h1 class="rm-ink" style="margin:0 0 16px;font-family:${font.body};font-size:24px;line-height:1.25;color:${colour.ink};">${escapeHtml(content.heading)}</h1>` +
    content.blocks.map(blockHtml).join('') +
    itemsHtml(content.items) +
    `</td>`
  )
}

function renderHtml(content: MailContent): string {
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">` +
    `<title>${escapeHtml(content.heading)}</title><style>${darkScheme}</style></head>` +
    `<body class="rm-paper" style="margin:0;padding:0;background:${colour.paper};">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(content.preview)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="rm-paper" style="background:${colour.paper};"><tr><td align="center" style="padding:32px 16px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">` +
    `<tr>${masthead}</tr><tr>${card(content)}</tr><tr>${footerHtml(content.footer)}</tr>` +
    `</table></td></tr></table></body></html>`
  )
}

/** Both parts of an email from its one description; every value is escaped
 * in the HTML (R-MSG-8). */
export function renderMail(content: MailContent): RenderedMail {
  return { text: renderText(content), html: renderHtml(content) }
}
