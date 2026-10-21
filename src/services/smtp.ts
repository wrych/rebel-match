import nodemailer, { type SendMailOptions } from 'nodemailer'
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

/** The SMTP transport for `MAIL_DELIVERY=smtp`, or null when delivery is off
 * and nothing may leave the machine (R-DEV-1, R-DEV-4). */
export function createTransport(mail: Config['mail']): MailTransport | null {
  if (mail.delivery === 'none') return null

  const { host, port, user, password } = mail.smtp
  const transporter = nodemailer.createTransport({
    ...(host === undefined ? {} : { host }),
    port,
    ...(user === undefined || password === undefined
      ? {}
      : { auth: { user, pass: password } }),
  })

  return {
    send: async (message) => {
      await transporter.sendMail(mailOptions(message))
    },
  }
}
