import type { LinkDelivery, OutgoingLink } from '../auth/index.js'
import type { Mailer, OutboundMessage } from './mailer.js'

const day = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

// Only the inbox hears that the account is set to be deleted: the login
// screen answered as it does for any member (ADR 0032).
function restoreMessage(link: OutgoingLink): OutboundMessage {
  const when =
    link.eraseAfter === undefined ? 'soon' : `on ${day.format(link.eraseAfter)}`
  return {
    memberId: link.memberId,
    to: link.email,
    kind: 'magic_link',
    subject: 'Keep your Rebel Match account?',
    text:
      `Hi,\n\nYou deleted your Rebel Match account. It is hidden from ` +
      `everyone and will be erased for good ${when}.\n\n` +
      `Changed your mind? Open this link and tap Sign in to keep it:\n\n` +
      `${link.url}\n\n` +
      'The link works once and expires. If you still want to leave, ignore ' +
      'this email and the account goes as planned.\n',
    credential: link.url,
  }
}

function signInMessage(link: OutgoingLink): OutboundMessage {
  if (link.kind === 'restore') return restoreMessage(link)
  const approved = link.kind === 'approval'
  const opening = approved
    ? 'Your request to join Rebel Match has been approved. Sign in here:'
    : 'Here is your link to sign in to Rebel Match:'

  return {
    memberId: link.memberId,
    to: link.email,
    kind: approved ? 'approval' : 'magic_link',
    subject: approved
      ? 'You are in: your Rebel Match sign-in link'
      : 'Your Rebel Match sign-in link',
    text:
      `Hi,\n\n${opening}\n\n${link.url}\n\n` +
      'The link works once and expires. If you did not ask for it, you can ' +
      'ignore this email.\n',
    credential: link.url,
  }
}

/** Sends the auth seam's links as email (ADR 0015). A link that could not be
 * sent is an error, so the caller never tells someone to check an inbox that
 * will stay empty. */
export function mailLinks(mailer: Mailer): LinkDelivery {
  return async (link) => {
    const status = await mailer.send(signInMessage(link))
    if (status === 'failed') throw new Error('sign-in link could not be sent')
  }
}
