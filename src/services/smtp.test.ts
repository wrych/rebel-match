import { describe, expect, it } from 'vitest'
import { LOGO_CID } from './mail-layout.js'
import { mailOptions, transportOptions } from './smtp.js'

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

  it('tells nodemailer where a reply goes (R-FB-1)', () => {
    expect(
      mailOptions({ ...mail, replyTo: 'grace@example.invalid' }).replyTo,
    ).toBe('grace@example.invalid')
  })
})

describe('transportOptions (R-NFR-1)', () => {
  it('refuses to send unless the server upgrades to TLS', () => {
    expect(
      transportOptions({ host: 'mail.example.invalid', port: 587 }),
    ).toMatchObject({
      host: 'mail.example.invalid',
      port: 587,
      requireTLS: true,
    })
  })

  it('signs in only with both a user and a password', () => {
    expect(
      transportOptions({ port: 587, user: 'rebel', password: 'secret' }).auth,
    ).toEqual({ user: 'rebel', pass: 'secret' })
    expect(transportOptions({ port: 587, user: 'rebel' }).auth).toBeUndefined()
  })
})
