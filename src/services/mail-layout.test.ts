import { describe, expect, it } from 'vitest'
import {
  escapeHtml,
  LOGO_CID,
  renderMail,
  type MailContent,
} from './mail-layout.js'

const request: MailContent = {
  heading: 'Ada wants to connect',
  preview: 'Ada would like to connect with you on Rebel Match.',
  blocks: [
    { kind: 'paragraph', text: 'Ada would like to connect with you.' },
    { kind: 'paragraph', text: 'They wrote:' },
    { kind: 'quote', text: 'Same reorg here.\nCoffee?' },
    {
      kind: 'action',
      action: {
        label: 'See the request',
        prompt: 'See their request here:',
        url: 'https://match.example.invalid/matches/requests/r1?notice=connection_request',
      },
    },
    { kind: 'aside', text: 'Your email address stays private.' },
  ],
  footer: {
    reason: 'You get this email because you are a Rebel Match member.',
    settings: 'https://match.example.invalid/profile',
  },
}

describe('renderMail: the plain text (R-MSG-8)', () => {
  it('reads as paragraphs, each link after the sentence that leads to it, then the footer', () => {
    expect(renderMail(request).text).toBe(
      'Ada would like to connect with you.\n\n' +
        'They wrote:\n\n' +
        'Same reorg here.\nCoffee?\n\n' +
        'See their request here:\n' +
        'https://match.example.invalid/matches/requests/r1?notice=connection_request\n\n' +
        'Your email address stays private.\n\n' +
        'You get this email because you are a Rebel Match member.\n\n' +
        'Choose how each kind of notification reaches you on your profile:\n' +
        'https://match.example.invalid/profile\n',
    )
  })

  it('puts a link with no sentence of its own on a line by itself', () => {
    const { text } = renderMail({
      heading: 'Sign in',
      preview: 'Your link works once.',
      blocks: [
        { kind: 'paragraph', text: 'Here is your link:' },
        {
          kind: 'action',
          action: { label: 'Sign in', url: 'https://x.invalid/v?t=1' },
        },
      ],
      footer: { reason: 'You asked for it.' },
    })

    expect(text).toBe(
      'Here is your link:\n\nhttps://x.invalid/v?t=1\n\nYou asked for it.\n',
    )
  })

  it('lists digest entries with the note each carries and its link', () => {
    const { text } = renderMail({
      ...request,
      blocks: [{ kind: 'paragraph', text: 'Here is what happened:' }],
      items: [
        {
          text: 'Ada wants to connect with you.',
          quote: 'Same here.',
          action: { label: 'See the request', url: 'https://x.invalid/r1' },
        },
        {
          text: 'Eve accepted your request.',
          action: { label: 'Get in touch', url: 'https://x.invalid/r2' },
        },
      ],
    })

    expect(text).toContain(
      'Here is what happened:\n\n' +
        'Ada wants to connect with you.\nThey wrote: Same here.\nhttps://x.invalid/r1\n\n' +
        'Eve accepted your request.\nhttps://x.invalid/r2\n\n',
    )
  })
})

describe('renderMail: the HTML (R-MSG-8)', () => {
  it('shows the heading, the preview line, the button and the footer link', () => {
    const { html } = renderMail(request)

    expect(html).toContain('>Ada wants to connect</h1>')
    expect(html).toContain(
      '>Ada would like to connect with you on Rebel Match.</div>',
    )
    expect(html).toContain(
      'href="https://match.example.invalid/matches/requests/r1?notice=connection_request"',
    )
    expect(html).toContain('>See the request</a>')
    expect(html).toContain(
      'href="https://match.example.invalid/profile" style="color:#6b6659;">Choose how notifications reach you</a>',
    )
  })

  it('keeps a member’s line breaks', () => {
    expect(renderMail(request).html).toContain('Same reorg here.<br>Coffee?')
  })

  it('writes a link out in full only when asked to', () => {
    const url = 'https://x.invalid/auth/verify?token=t&next=%2F'
    const mail = (spelled: boolean): string =>
      renderMail({
        ...request,
        blocks: [
          { kind: 'action', action: { label: 'Sign in', url, spelled } },
        ],
      }).html

    expect(mail(true)).toContain(
      `Or paste this link into your browser:</p>` +
        `<p style="margin:0 0 24px;font-family:'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace;font-size:12px;line-height:1.5;word-break:break-all;">` +
        `<a href="https://x.invalid/auth/verify?token=t&amp;next=%2F" style="color:#d4471f;">https://x.invalid/auth/verify?token=t&amp;next=%2F</a>`,
    )
    expect(mail(false)).not.toContain('Or paste this link')
  })

  it('turns markup in anything a member wrote into text', () => {
    const { html } = renderMail({
      ...request,
      heading: '<b>Ada</b> wants to connect',
      blocks: [
        { kind: 'quote', text: '<a href="https://evil.invalid">click</a>' },
      ],
      items: [
        {
          text: '<img src=x onerror=alert(1)> joined',
          quote: '"quoted" & \'single\'',
          action: { label: 'See', url: 'https://x.invalid/"><script>' },
        },
      ],
    })

    expect(html).not.toContain('<b>Ada')
    expect(html).not.toContain('<a href="https://evil.invalid"')
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;b&gt;Ada&lt;/b&gt; wants to connect')
    expect(html).toContain('&quot;quoted&quot; &amp; &#39;single&#39;')
  })

  it('shows the RR mark the message carries, and fetches nothing', () => {
    const { html } = renderMail(request)

    expect(html).toContain(`src="cid:${LOGO_CID}"`)
    expect(html).not.toMatch(/src="https?:/)
    expect(html).not.toMatch(/url\(/)
    expect(html).not.toMatch(/<link\b/)
  })

  it('lists digest entries as rows, each with its own link', () => {
    const { html } = renderMail({
      ...request,
      items: [
        {
          text: 'Ada wants to connect with you.',
          quote: 'Same here.',
          action: { label: 'See the request', url: 'https://x.invalid/r1' },
        },
      ],
    })

    expect(html).toContain('>Ada wants to connect with you.</p>')
    expect(html).toContain('>Same here.</td>')
    expect(html).toContain(
      'href="https://x.invalid/r1" style="font-size:14px;font-weight:bold;color:#d4471f;text-decoration:none;">See the request &rarr;</a>',
    )
  })
})

describe('escapeHtml', () => {
  it('escapes the five characters that can end text or an attribute', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    )
  })
})
