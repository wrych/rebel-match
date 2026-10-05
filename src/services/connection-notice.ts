import type { Mailer } from './mailer.js'

export interface MemberDirectory {
  /** The address of an active member, or null. */
  emailOf(memberId: string): Promise<string | null>
  /** The display name of a member, or null. */
  nameOf(memberId: string): Promise<string | null>
}

/** A request just made: who asked whom, and the note they wrote. */
export interface NewRequest {
  id: string
  requesterId: string
  targetId: string
  message: string | null
}

const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim()

function bodyOf(name: string, message: string | null, link: string): string {
  const note = message === null ? '' : `They wrote:\n\n${message}\n\n`
  return (
    `${name} would like to connect with you on Rebel Match.\n\n` +
    note +
    `See their request, and accept or decline it, here:\n${link}\n\n` +
    'Your email address stays private unless you accept.\n'
  )
}

/** Emails the target of a new connection request the requester's name, their
 * note and a link to the request; never an address or challenge text
 * (R-CONN-2, R-NAV-9). The entry is erased with either member (R-MSG-6). */
export function createConnectionNotice(deps: {
  mailer: Mailer
  members: MemberDirectory
  publicUrl: string
}): (request: NewRequest) => Promise<void> {
  return async (request) => {
    const to = await deps.members.emailOf(request.targetId)
    if (to === null) return
    const name = oneLine((await deps.members.nameOf(request.requesterId)) ?? '')
    const from = name === '' ? 'A Rebel Match member' : name
    const path = `/matches/requests/${encodeURIComponent(request.id)}`
    const link = new URL(path, deps.publicUrl).toString()

    await deps.mailer.send({
      memberId: request.targetId,
      aboutMemberId: request.requesterId,
      to,
      kind: 'connection_request',
      subject: `${from} wants to connect with you on Rebel Match`,
      text: bodyOf(from, request.message, link),
    })
  }
}
