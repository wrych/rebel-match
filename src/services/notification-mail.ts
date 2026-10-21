import {
  eventRow,
  eventTitle,
  rowNames,
  type RowNames,
} from '../badges/rows.js'
import { createApplicantNotice } from './applicant-notice.js'
import { badgeLine, createBadgeNotice, type BadgeNote } from './badge-notice.js'
import { createReportNotice, openReportsWords } from './report-notice.js'
import { renderMail, type MailItem } from './mail-layout.js'
import { noticeFooter, noticeLink } from './notice-link.js'
import { badgeName, badgePath, type NotificationKind } from './notifications.js'
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
  timeZone: string
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

// What a badge notification needs to be worded; null when its row is gone.
function badgeOf(
  note: DueNotification,
): Omit<BadgeNote, 'recipientId' | 'to'> | null {
  const names =
    note.badge === null
      ? undefined
      : (rowNames as Readonly<Record<string, RowNames | undefined>>)[
          note.badge.row
        ]
  const rowTitle = note.badge?.row === eventRow ? eventTitle : names?.title
  if (note.badge === null || rowTitle === undefined) return null
  return {
    name: badgeName(note.badge),
    rowTitle,
    path: badgePath(note.badge.row),
    crown: note.badge.level === 0,
  }
}

async function aboutBadge(
  deps: SenderDeps & { mailer: Mailer },
  note: DueNotification,
): Promise<void> {
  const to = await deps.members.emailOf(note.recipientId)
  const badge = badgeOf(note)
  if (to === null || badge === null) return
  await createBadgeNotice(deps)({ recipientId: note.recipientId, to, ...badge })
}

// One member's name on a line of its own, as the single emails say it.
async function nameOf(deps: SenderDeps, memberId: string): Promise<string> {
  const name = ((await deps.members.nameOf(memberId)) ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  return name === '' ? 'A Rebel Match member' : name
}

const linkFor = (
  deps: SenderDeps,
  path: string,
  kind: NotificationKind,
): string => noticeLink(deps.publicUrl, path, kind)

const requestPath = (id: string, tail = ''): string =>
  `/matches/requests/${encodeURIComponent(id)}${tail}`

// One entry of a digest: what happened, the note a request carries, and the
// link its own email would give (R-NOTE-8, R-NAV-9). Null when it no longer
// exists.
async function itemOf(
  deps: SenderDeps,
  note: DueNotification,
): Promise<MailItem | null> {
  if (note.type === 'applicant')
    return note.applicantEmail === null
      ? null
      : {
          text: `${note.applicantEmail} asked to join.`,
          action: {
            label: 'Review applicants',
            url: linkFor(deps, '/admin/applicants', 'applicant'),
          },
        }
  if (note.type === 'badge') return badgeItem(deps, note)
  if (note.type === 'trend_challenge') return trendItem(deps, note)
  if (note.type === 'report')
    return {
      name: await nameOf(deps, note.aboutMemberId),
      text: `was reported. ${openReportsWords(note.openReports)}.`,
      action: {
        label: 'Review the reports',
        url: linkFor(
          deps,
          `/admin/moderation/${encodeURIComponent(note.aboutMemberId)}`,
          'report',
        ),
      },
    }
  return requestItem(deps, note)
}

function badgeItem(deps: SenderDeps, note: DueNotification): MailItem | null {
  const badge = badgeOf(note)
  return badge === null
    ? null
    : {
        text: badgeLine(badge),
        action: {
          label: 'See your badges',
          url: linkFor(deps, badge.path, 'badge'),
        },
      }
}

async function trendItem(
  deps: SenderDeps,
  note: DueNotification,
): Promise<MailItem | null> {
  return note.challengeId === null || note.trend === null
    ? null
    : {
        name: await nameOf(deps, note.aboutMemberId),
        text: `posted a challenge in ${note.trend}.`,
        action: {
          label: 'See the challenge',
          url: linkFor(deps, deckAt(note.challengeId), 'trend_challenge'),
        },
      }
}

async function requestItem(
  deps: SenderDeps,
  note: DueNotification,
): Promise<MailItem | null> {
  const record =
    note.connectionId === null
      ? null
      : await deps.requests.find(note.connectionId)
  if (record === null) return null
  const name = await nameOf(deps, note.aboutMemberId)
  const wrote = record.message === null ? {} : { quote: record.message }
  if (note.type === 'connection_request')
    return {
      name,
      text: 'wants to connect with you.',
      ...wrote,
      action: {
        label: 'See the request',
        url: linkFor(deps, requestPath(record.id), 'connection_request'),
      },
    }
  return note.recipientId === record.requesterId
    ? {
        name,
        text: 'accepted your request.',
        action: {
          label: 'Get in touch',
          url: linkFor(
            deps,
            requestPath(record.id, '/contact'),
            'connection_accepted',
          ),
        },
      }
    : {
        name,
        text: 'connected with you over another challenge.',
        ...wrote,
        action: {
          label: 'See your connection',
          url: linkFor(
            deps,
            requestPath(record.id, '/contact'),
            'connection_added',
          ),
        },
      }
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
  const items: MailItem[] = []
  const quotes: string[] = []
  for (const note of notes) {
    const item = await itemOf(deps, note)
    if (item === null) continue
    items.push(item)
    quotes.push(note.aboutMemberId)
  }
  if (items.length === 0) return null
  const updates = `${String(items.length)} ${items.length === 1 ? 'update' : 'updates'}`
  return deps.mailer.send({
    memberId: recipientId,
    quotes,
    to,
    kind: 'notification_digest',
    subject: `${updates} on Rebel Match`,
    ...renderMail({
      heading: updates,
      preview: 'Here is what happened on Rebel Match.',
      blocks: [
        { kind: 'paragraph', text: 'Here is what happened on Rebel Match:' },
      ],
      items,
      footer: noticeFooter(deps.publicUrl),
    }),
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

async function aboutReport(
  deps: SenderDeps & { mailer: Mailer },
  note: DueNotification,
): Promise<void> {
  const to = await deps.members.emailOf(note.recipientId)
  if (to === null) return
  await createReportNotice(deps)({
    reviewerId: note.recipientId,
    to,
    reportedId: note.aboutMemberId,
    reportedName: await nameOf(deps, note.aboutMemberId),
    openReports: note.openReports,
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
  else if (note.type === 'badge') await aboutBadge({ ...deps, mailer }, note)
  else if (note.type === 'report') await aboutReport({ ...deps, mailer }, note)
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
