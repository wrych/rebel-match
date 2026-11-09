import { describe, expect, it } from 'vitest'
import { renderMail } from './mail-layout.js'
import { renderNotice } from './notice-mail.js'

const publicUrl = 'https://match.example.invalid'

describe('renderNotice (R-MSG-8, R-ANA-1)', () => {
  it('leads with the text and ends on a marked link and the member footer', () => {
    const mail = renderNotice(publicUrl, 'badge', {
      heading: 'A new badge',
      preview: 'You earned a badge.',
      text: 'You earned a badge.',
      action: {
        label: 'See your badges',
        prompt: 'See your badges here:',
        path: '/badges',
      },
    })

    expect(mail.text).toBe(
      'You earned a badge.\n\n' +
        'See your badges here:\n' +
        'https://match.example.invalid/badges?notice=badge\n\n' +
        'You get this email because you are a Rebel Match member.\n\n' +
        'Choose how each kind of notification reaches you on your profile:\n' +
        'https://match.example.invalid/profile\n',
    )
  })

  it('places further blocks before the button and the aside after it', () => {
    const mail = renderNotice(publicUrl, 'connection_request', {
      heading: 'Ada wants to connect',
      preview: 'Ada would like to connect.',
      text: 'Ada would like to connect.',
      blocks: [{ kind: 'quote', text: 'Hello' }],
      action: { label: 'See it', prompt: 'See it here:', path: '/r/1' },
      aside: 'Your address stays private.',
    })

    expect(mail).toEqual(
      renderMail({
        heading: 'Ada wants to connect',
        preview: 'Ada would like to connect.',
        blocks: [
          { kind: 'paragraph', text: 'Ada would like to connect.' },
          { kind: 'quote', text: 'Hello' },
          {
            kind: 'action',
            action: {
              label: 'See it',
              prompt: 'See it here:',
              url: 'https://match.example.invalid/r/1?notice=connection_request',
            },
          },
          { kind: 'aside', text: 'Your address stays private.' },
        ],
        footer: {
          reason: 'You get this email because you are a Rebel Match member.',
          settings: 'https://match.example.invalid/profile',
        },
      }),
    )
  })
})
