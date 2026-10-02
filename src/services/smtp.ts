import nodemailer from 'nodemailer'
import type { Config } from '../config.js'
import type { MailTransport } from './mailer.js'

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
      await transporter.sendMail(message)
    },
  }
}
