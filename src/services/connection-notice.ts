import type { MailBlock } from './mail-layout.js'
import type { Mailer } from './mailer.js'
import { renderNotice, type Notice } from './notice-mail.js'
import type { ConnectionKind } from './connections.js'

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
  kind: ConnectionKind
  message: string | null
}

/** A request its target just accepted. */
export interface AcceptedRequest {
  id: string
  requesterId: string
  targetId: string
}

const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim()

function noteBlocks(message: string | null): MailBlock[] {
  return message === null
    ? []
    : [
        { kind: 'paragraph', text: 'They wrote:' },
        { kind: 'quote', text: message },
      ]
}

function requestMail(
  name: string,
  message: string | null,
  path: string,
): Notice {
  return {
    heading: `${name} wants to connect`,
    preview: `${name} would like to connect with you on Rebel Match.`,
    text: `${name} would like to connect with you on Rebel Match.`,
    blocks: noteBlocks(message),
    action: {
      label: 'See the request',
      prompt: 'See their request, and accept or decline it, here:',
      path,
    },
    aside: 'Your email address stays private unless you accept.',
  }
}

interface NoticeDeps {
  mailer: Mailer
  members: MemberDirectory
  publicUrl: string
}

async function displayName(
  members: MemberDirectory,
  memberId: string,
): Promise<string> {
  const name = oneLine((await members.nameOf(memberId)) ?? '')
  return name === '' ? 'A Rebel Match member' : name
}

const requestPath = (id: string, tail = ''): string =>
  `/matches/requests/${encodeURIComponent(id)}${tail}`

/** Emails the target of a new connection request the requester's name, their
 * note and a link to the request; never an address or challenge text
 * (R-CONN-2, R-NAV-9). The entry is erased with either member (R-MSG-6). */
export function createConnectionNotice(
  deps: NoticeDeps,
): (request: NewRequest) => Promise<void> {
  return async (request) => {
    const to = await deps.members.emailOf(request.targetId)
    if (to === null) return
    const from = await displayName(deps.members, request.requesterId)

    await deps.mailer.send({
      memberId: request.targetId,
      aboutMemberId: request.requesterId,
      to,
      kind: 'connection_request',
      subject: `${from} wants to connect with you on Rebel Match`,
      ...renderNotice(
        deps.publicUrl,
        'connection_request',
        requestMail(from, request.message, requestPath(request.id)),
      ),
    })
  }
}

/** Emails the requester of a just-accepted request the target's name and a
 * link to the contact screen; never an address or challenge text (R-CONN-7,
 * R-NAV-9). The entry is erased with either member (R-MSG-6). */
export function createAcceptNotice(
  deps: NoticeDeps,
): (request: AcceptedRequest) => Promise<void> {
  return async (request) => {
    const to = await deps.members.emailOf(request.requesterId)
    if (to === null) return
    const by = await displayName(deps.members, request.targetId)

    await deps.mailer.send({
      memberId: request.requesterId,
      aboutMemberId: request.targetId,
      to,
      kind: 'connection_accepted',
      subject: `${by} accepted your request on Rebel Match`,
      ...renderNotice(deps.publicUrl, 'connection_accepted', {
        heading: `${by} accepted your request`,
        preview: "You can now see each other's email address.",
        text: `${by} accepted your request to connect on Rebel Match.`,
        action: {
          label: 'Get in touch',
          prompt:
            "You can now see each other's email address. Get in touch here:",
          path: requestPath(request.id, '/contact'),
        },
      }),
    })
  }
}

/** How a connection made at once is told: over another challenge, or about
 * none, directly (R-CONN-9, R-CODE-6). */
export function addedWords(kind: ConnectionKind): string {
  return kind === 'direct'
    ? 'connected with you directly'
    : 'connected with you over another challenge'
}

function addedMail(name: string, request: NewRequest): Notice {
  const words = addedWords(request.kind)
  return {
    heading:
      request.kind === 'direct'
        ? `${name} connected with you`
        : `${name} connected with you again`,
    preview: `${name} ${words}.`,
    text: `${name} ${words} on Rebel Match.`,
    blocks: noteBlocks(request.message),
    action: {
      label: 'See your connection',
      prompt: 'See what you are connected over here:',
      path: requestPath(request.id, '/contact'),
    },
  }
}

/** Emails the target of a request accepted at once, between members already
 * connected, the requester's name, their note and a link to the contact
 * screen; never an address or challenge text (R-CONN-9, R-NAV-9). */
export function createAddedNotice(
  deps: NoticeDeps,
): (request: NewRequest) => Promise<void> {
  return async (request) => {
    const to = await deps.members.emailOf(request.targetId)
    if (to === null) return
    const from = await displayName(deps.members, request.requesterId)

    await deps.mailer.send({
      memberId: request.targetId,
      aboutMemberId: request.requesterId,
      to,
      kind: 'connection_added',
      subject: `${from} ${addedWords(request.kind)}`,
      ...renderNotice(
        deps.publicUrl,
        'connection_added',
        addedMail(from, request),
      ),
    })
  }
}
