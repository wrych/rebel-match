import type { Mailer } from './mailer.js'

export interface MemberDirectory {
  /** The address of an active member, or null. */
  emailOf(memberId: string): Promise<string | null>
}

/** A request just made: enough to address and link it, nothing to quote. */
export interface NewRequest {
  id: string
  targetId: string
}

/** Emails the target of a new connection request a link to it, and nothing
 * else: no names, challenge text, note or address (R-CONN-2, R-NAV-9). */
export function createConnectionNotice(deps: {
  mailer: Mailer
  members: MemberDirectory
  publicUrl: string
}): (request: NewRequest) => Promise<void> {
  return async (request) => {
    const to = await deps.members.emailOf(request.targetId)
    if (to === null) return
    const path = `/matches/requests/${encodeURIComponent(request.id)}`
    const link = new URL(path, deps.publicUrl).toString()

    await deps.mailer.send({
      memberId: request.targetId,
      to,
      kind: 'connection_request',
      subject: 'Someone wants to connect with you on Rebel Match',
      text:
        'A Rebel Match member would like to connect with you.\n\n' +
        `See their request, and accept or decline it, here:\n${link}\n\n` +
        'Your email address stays private unless you accept.\n',
    })
  }
}
