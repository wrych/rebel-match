import { createApplicantNotice } from './applicant-notice.js'
import { createTrendNotice, deckAt } from './trend-notice.js'
import {
  createAcceptNotice,
  createAddedNotice,
  createConnectionNotice,
  type MemberDirectory,
} from './connection-notice.js'
import type { ConnectionRecord } from './connections.js'
import type { DeliveryStatus, Mailer } from './mailer.js'
import type {
  DueNotification,
  SendNotifications,
} from './notification-worker.js'

interface SenderDeps {
  mailer: Mailer
  members: MemberDirectory
  publicUrl: string
  requests: { find(id: string): Promise<ConnectionRecord | null> }
}

// A request's own email: to its target when it is the request or one made
// between members already connected, to its requester when accepted.
async function aboutRequest(
  deps: SenderDeps & { mailer: Mailer },
  note: DueNotification,
): Promise<void> {
  const record =
    note.connectionId === null
      ? null
      : await deps.requests.find(note.connectionId)
  if (record === null) return
  if (note.type === 'connection_request')
    return createConnectionNotice(deps)(record)
  return note.recipientId === record.requesterId
    ? createAcceptNotice(deps)(record)
    : createAddedNotice(deps)(record)
}

async function aboutApplicant(
  deps: SenderDeps & { mailer: Mailer },
  note: DueNotification,
): Promise<void> {
  const to = await deps.members.emailOf(note.recipientId)
  if (to === null || note.applicantEmail === null) return
  await createApplicantNotice(deps)({
    reviewerId: note.recipientId,
    to,
    applicantId: note.aboutMemberId,
    applicantEmail: note.applicantEmail,
    at: note.createdAt,
  })
}

// One member's name on a line of its own, as the single emails say it.
async function nameOf(deps: SenderDeps, memberId: string): Promise<string> {
  const name = ((await deps.members.nameOf(memberId)) ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  return name === '' ? 'A Rebel Match member' : name
}

const link = (deps: SenderDeps, path: string): string =>
  new URL(path, deps.publicUrl).toString()

const requestPath = (id: string, tail = ''): string =>
  `/matches/requests/${encodeURIComponent(id)}${tail}`

// One entry of a digest: what happened, the note a request carries, and the
// link its own email would give (R-NOTE-8, R-NAV-9). Null when it no longer
// exists.
async function itemOf(
  deps: SenderDeps,
  note: DueNotification,
): Promise<string | null> {
  if (note.type === 'applicant')
    return note.applicantEmail === null
      ? null
      : `${note.applicantEmail} asked to join.\n${link(deps, '/admin/applicants')}`
  if (note.type === 'trend_challenge')
    return note.challengeId === null || note.trend === null
      ? null
      : `${await nameOf(deps, note.aboutMemberId)} posted a challenge in ${note.trend}.\n${link(deps, deckAt(note.challengeId))}`
  return requestItem(deps, note)
}

async function requestItem(
  deps: SenderDeps,
  note: DueNotification,
): Promise<string | null> {
  const record =
    note.connectionId === null
      ? null
      : await deps.requests.find(note.connectionId)
  if (record === null) return null
  const name = await nameOf(deps, note.aboutMemberId)
  const wrote = record.message === null ? '' : `\nThey wrote: ${record.message}`
  if (note.type === 'connection_request')
    return `${name} wants to connect with you.${wrote}\n${link(deps, requestPath(record.id))}`
  return note.recipientId === record.requesterId
    ? `${name} accepted your request.\n${link(deps, requestPath(record.id, '/contact'))}`
    : `${name} connected with you over another challenge.${wrote}\n${link(deps, requestPath(record.id, '/contact'))}`
}

// Several notifications in one mail, each with its own link; every member it
// names is recorded, so erasing any of them erases the entry (R-NOTE-8,
// R-MSG-6).
async function digest(
  deps: SenderDeps,
  notes: readonly DueNotification[],
): Promise<DeliveryStatus | null> {
  const [first] = notes
  if (first === undefined) return null
  const { recipientId } = first
  const to = await deps.members.emailOf(recipientId)
  if (to === null) return null
  const items: string[] = []
  const quotes: string[] = []
  for (const note of notes) {
    const item = await itemOf(deps, note)
    if (item === null) continue
    items.push(item)
    quotes.push(note.aboutMemberId)
  }
  if (items.length === 0) return null
  return deps.mailer.send({
    memberId: recipientId,
    quotes,
    to,
    kind: 'notification_digest',
    subject: `${String(items.length)} ${items.length === 1 ? 'update' : 'updates'} on Rebel Match`,
    text:
      `Here is what happened on Rebel Match:\n\n${items.join('\n\n')}\n\n` +
      `Choose how each kind of notification reaches you on your profile:\n` +
      `${link(deps, '/profile')}\n`,
  })
}

async function aboutChallenge(
  deps: SenderDeps & { mailer: Mailer },
  note: DueNotification,
): Promise<void> {
  const to = await deps.members.emailOf(note.recipientId)
  if (to === null || note.challengeId === null || note.trend === null) return
  await createTrendNotice(deps)({
    recipientId: note.recipientId,
    to,
    authorId: note.aboutMemberId,
    authorName: await nameOf(deps, note.aboutMemberId),
    trend: note.trend,
    challengeId: note.challengeId,
  })
}

async function single(
  deps: SenderDeps,
  note: DueNotification,
): Promise<DeliveryStatus | null> {
  let status: DeliveryStatus | null = null
  const mailer: Mailer = {
    send: async (message) => {
      status = await deps.mailer.send(message)
      return status
    },
  }
  if (note.type === 'applicant') await aboutApplicant({ ...deps, mailer }, note)
  else if (note.type === 'trend_challenge')
    await aboutChallenge({ ...deps, mailer }, note)
  else await aboutRequest({ ...deps, mailer }, note)
  return status
}

/** Mails one member's notifications: one as its type's own email, several as
 * one digest (R-NOTE-8). Says what became of the mail: null when there was
 * nobody to send it to. */
export function createNotificationSender(deps: SenderDeps): SendNotifications {
  return (notes) => {
    const [only, ...more] = notes
    return only !== undefined && more.length === 0
      ? single(deps, only)
      : digest(deps, notes)
  }
}
