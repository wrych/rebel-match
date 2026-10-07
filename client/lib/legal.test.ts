import { describe, expect, it } from 'vitest'
import privacyNotice from '../../docs/legal/privacy-notice.md?raw'
import termsOfUse from '../../docs/legal/terms-of-use.md?raw'
import { inlinesOf, parseLegal } from './legal'

const sample = `# Rebel Match — Sample notice

- **Status:** Draft
- **Version:** 2026-10-07

Notes for whoever edits this file.

---

## 1. Who

Run by **Example GmbH**, Zürich. Write to
hello@example.org.

- **Your email.** You sign in
  with it.
- Providers:
  - Hosting in Zurich.
  - Mail from our
    own server.

---

Credit line.
`

describe('parseLegal', () => {
  it('takes the title after the dash and the version from the header', () => {
    const document = parseLegal(sample)
    expect(document.title).toBe('Sample notice')
    expect(document.version).toBe('2026-10-07')
  })

  it('shows only what is below the first rule', () => {
    const text = JSON.stringify(parseLegal(sample).blocks)
    expect(text).not.toContain('Notes for whoever')
    expect(parseLegal(sample).blocks[0]).toEqual({
      kind: 'heading',
      text: '1. Who',
    })
  })

  it('joins the lines of a paragraph', () => {
    expect(parseLegal(sample).blocks[1]).toEqual({
      kind: 'paragraph',
      inlines: [
        { kind: 'text', text: 'Run by ' },
        { kind: 'strong', text: 'Example GmbH' },
        { kind: 'text', text: ', Zürich. Write to ' },
        {
          kind: 'link',
          text: 'hello@example.org',
          href: 'mailto:hello@example.org',
        },
        { kind: 'text', text: '.' },
      ],
    })
  })

  it('reads list items with their continuation lines and sub-items', () => {
    const list = parseLegal(sample).blocks[2]
    expect(list).toEqual({
      kind: 'list',
      items: [
        {
          inlines: [
            { kind: 'strong', text: 'Your email.' },
            { kind: 'text', text: ' You sign in with it.' },
          ],
          items: [],
        },
        {
          inlines: [{ kind: 'text', text: 'Providers:' }],
          items: [
            [{ kind: 'text', text: 'Hosting in Zurich.' }],
            [{ kind: 'text', text: 'Mail from our own server.' }],
          ],
        },
      ],
    })
  })

  it('keeps the closing rule and the credit under it', () => {
    const blocks = parseLegal(sample).blocks
    expect(blocks.slice(-2)).toEqual([
      { kind: 'rule' },
      { kind: 'paragraph', inlines: [{ kind: 'text', text: 'Credit line.' }] },
    ])
  })

  it('refuses a document without a version', () => {
    expect(() => parseLegal('# Notice\n\n---\n\nText.')).toThrow()
  })
})

describe('inlinesOf', () => {
  it('links a web address without its closing punctuation', () => {
    expect(inlinesOf('See https://github.com/wrych/rebel-match.')).toEqual([
      { kind: 'text', text: 'See ' },
      {
        kind: 'link',
        text: 'https://github.com/wrych/rebel-match',
        href: 'https://github.com/wrych/rebel-match',
      },
      { kind: 'text', text: '.' },
    ])
  })
})

describe('the documents in docs/legal', () => {
  it.each([
    [
      'privacy notice',
      privacyNotice,
      'Privacy notice',
      '1. Who is responsible',
    ],
    ['terms of use', termsOfUse, 'Terms of use', '1. What this is'],
  ])('the %s reads with its version', (_, markdown, title, first) => {
    const document = parseLegal(markdown)
    expect(document.title).toBe(title)
    expect(document.version).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(document.blocks[0]).toEqual({ kind: 'heading', text: first })
  })

  it('says in the privacy notice that email is shared only on a connection', () => {
    const text = JSON.stringify(parseLegal(privacyNotice).blocks)
    expect(text).toContain(
      'Your email address is shared with another member only when both of you accept a connection.',
    )
  })
})
