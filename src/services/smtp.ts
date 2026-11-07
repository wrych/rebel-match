import nodemailer, { type SendMailOptions } from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js'
import type { Config } from '../config.js'
import { LOGO_CID } from './mail-layout.js'
import { MAIL_LOGO_PNG_BASE64 } from './mail-logo.js'
import type { MailTransport } from './mailer.js'

const logo = {
  filename: 'rebel-match.png',
  content: MAIL_LOGO_PNG_BASE64,
  encoding: 'base64',
  contentType: 'image/png',
  cid: LOGO_CID,
}

/** What nodemailer is handed: an HTML part carries the RR mark inside the
 * message, so the mail fetches nothing (R-MSG-8). */
export function mailOptions(
  message: Parameters<MailTransport['send']>[0],
): SendMailOptions {
  return message.html === undefined
    ? message
    : { ...message, attachments: [logo] }
}

/** How nodemailer reaches the SMTP server: always over TLS, refusing to send
 * in the clear when the server offers no STARTTLS, since every mail may carry a
 * sign-in link (R-NFR-1). */
export function transportOptions(
  smtp: Config['mail']['smtp'],
): SMTPTransport.Options {
  const { host, port, user, password } = smtp
  return {
    ...(host === undefined ? {} : { host }),
    port,
    requireTLS: true,
    ...(user === undefined || password === undefined
      ? {}
      : { auth: { user, pass: password } }),
  }
}

/** The SMTP transport for `MAIL_DELIVERY=smtp`, or null when delivery is off
 * and nothing may leave the machine (R-DEV-1, R-DEV-4). */
export function createTransport(mail: Config['mail']): MailTransport | null {
  if (mail.delivery === 'none') return null

  const transporter = nodemailer.createTransport(transportOptions(mail.smtp))

  return {
    send: async (message) => {
      await transporter.sendMail(mailOptions(message))
    },
  }
}
