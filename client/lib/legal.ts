/** A run of text in a legal document: plain, bold, or a link (R-ONB-9). */
export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'link'; text: string; href: string }

export interface ListItem {
  inlines: Inline[]
  items: Inline[][]
}

export type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; inlines: Inline[] }
  | { kind: 'list'; items: ListItem[] }
  | { kind: 'rule' }

/** A document of `docs/legal/` as its screen shows it: its title, version,
 * and the text below its first rule (R-ONB-9, R-ONB-13). */
export interface LegalDocument {
  title: string
  version: string
  blocks: Block[]
}

const TITLE = /^# (?:.+? — )?(.+)$/m
const VERSION = /^- \*\*Version:\*\* (\S+)$/m
const RULE = /^---$/m
const HEADING = /^#{2,} (.+)$/
const ITEM = /^- (.*)$/
const SUB_ITEM = /^ {2}- (.*)$/
const CONTINUATION = /^ {2,}(\S.*)$/
const INLINE =
  /\*\*(.+?)\*\*|(https:\/\/[^\s)]+[^\s).,;:])|([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g

/** Splits a line of text into plain, bold and linked runs. */
export function inlinesOf(text: string): Inline[] {
  const runs: Inline[] = []
  let from = 0
  for (const match of text.matchAll(INLINE)) {
    if (match.index > from)
      runs.push({ kind: 'text', text: text.slice(from, match.index) })
    const [whole, strong, url, email] = match
    if (strong !== undefined) runs.push({ kind: 'strong', text: strong })
    else if (url !== undefined)
      runs.push({ kind: 'link', text: url, href: url })
    else if (email !== undefined)
      runs.push({ kind: 'link', text: email, href: `mailto:${email}` })
    from = match.index + whole.length
  }
  if (from < text.length) runs.push({ kind: 'text', text: text.slice(from) })
  return runs
}

interface Draft {
  text: string
  items: string[]
}

function continueDraft(draft: Draft, more: string): void {
  const last = draft.items.length - 1
  if (last >= 0) draft.items[last] += ` ${more}`
  else draft.text += ` ${more}`
}

function draftsOf(lines: string[]): Draft[] {
  const drafts: Draft[] = []
  for (const line of lines) {
    const current = drafts.at(-1)
    const item = ITEM.exec(line)?.[1]
    const sub = SUB_ITEM.exec(line)?.[1]
    const more = CONTINUATION.exec(line)?.[1]
    if (item !== undefined) drafts.push({ text: item, items: [] })
    else if (current === undefined) continue
    else if (sub !== undefined) current.items.push(sub)
    else if (more !== undefined) continueDraft(current, more)
  }
  return drafts
}

function listOf(lines: string[]): Block {
  return {
    kind: 'list',
    items: draftsOf(lines).map((draft) => ({
      inlines: inlinesOf(draft.text),
      items: draft.items.map(inlinesOf),
    })),
  }
}

function blockOf(lines: string[]): Block {
  const [first = ''] = lines
  if (first === '---') return { kind: 'rule' }
  const heading = HEADING.exec(first)
  if (heading && lines.length === 1)
    return { kind: 'heading', text: heading[1] ?? '' }
  if (ITEM.test(first)) return listOf(lines)
  return { kind: 'paragraph', inlines: inlinesOf(lines.join(' ')) }
}

/** Reads a document of `docs/legal/`: the title and version from its header,
 * and the blocks below its first rule. Throws when it lacks either. */
export function parseLegal(markdown: string): LegalDocument {
  const title = TITLE.exec(markdown)?.[1]
  const version = VERSION.exec(markdown)?.[1]
  const rule = RULE.exec(markdown)
  if (title === undefined || version === undefined || rule === null)
    throw new Error('a legal document needs a title, a version and a rule')
  const body = markdown.slice(rule.index + rule[0].length)
  const blocks = body
    .split(/\n\s*\n/)
    .map((chunk) => chunk.split('\n').filter((line) => line.trim() !== ''))
    .filter((lines) => lines.length > 0)
    .map(blockOf)
  return { title, version, blocks }
}
