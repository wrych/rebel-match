import { createApplicantNotice } from './applicant-notice.js'
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
  SendNotification,
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

/** Mails one notification as its type's own email (R-NOTE-8), and says what
 * became of it: null when there was nobody to send it to. */
export function createNotificationSender(deps: SenderDeps): SendNotification {
  return async (note) => {
    let status: DeliveryStatus | null = null
    const mailer: Mailer = {
      send: async (message) => {
        status = await deps.mailer.send(message)
        return status
      },
    }
    if (note.type === 'applicant')
      await aboutApplicant({ ...deps, mailer }, note)
    else await aboutRequest({ ...deps, mailer }, note)
    return status
  }
}
