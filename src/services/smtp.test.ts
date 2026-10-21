import { describe, expect, it } from 'vitest'
import { LOGO_CID } from './mail-layout.js'
import { mailOptions } from './smtp.js'

const mail = {
  from: { name: 'Rebel Match', address: 'hello@example.invalid' },
  to: 'ada@example.invalid',
  subject: 'Your Rebel Match sign-in link',
  text: 'Sign in: https://x.invalid',
}

describe('mailOptions (R-MSG-8)', () => {
  it('carries the RR mark inside an HTML email, under the id the HTML names', () => {
    const options = mailOptions({ ...mail, html: '<p>Sign in</p>' })

    expect(options).toMatchObject({ ...mail, html: '<p>Sign in</p>' })
    expect(options.attachments).toEqual([
      expect.objectContaining({
        cid: LOGO_CID,
        contentType: 'image/png',
        encoding: 'base64',
      }),
    ])
  })

  it('attaches nothing to a plain-text email', () => {
    expect(mailOptions(mail)).toEqual(mail)
  })
})
