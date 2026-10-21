import { renderMail, type MailBlock, type MailContent } from './mail-layout.js'
import type { Mailer } from './mailer.js'
import { noticeFooter, noticeLink } from './notice-link.js'
import type { NotificationKind } from './notifications.js'

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
  link: string,
  publicUrl: string,
): MailContent {
  return {
    heading: `${name} wants to connect`,
    preview: `${name} would like to connect with you on Rebel Match.`,
    blocks: [
      {
        kind: 'paragraph',
        text: `${name} would like to connect with you on Rebel Match.`,
      },
      ...noteBlocks(message),
      {
        kind: 'action',
        action: {
          label: 'See the request',
          prompt: 'See their request, and accept or decline it, here:',
          url: link,
        },
      },
      {
        kind: 'aside',
        text: 'Your email address stays private unless you accept.',
      },
    ],
    footer: noticeFooter(publicUrl),
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

function linkTo(
  deps: NoticeDeps,
  id: string,
  kind: NotificationKind,
  tail = '',
): string {
  const path = `/matches/requests/${encodeURIComponent(id)}${tail}`
  return noticeLink(deps.publicUrl, path, kind)
}

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
      ...renderMail(
        requestMail(
          from,
          request.message,
          linkTo(deps, request.id, 'connection_request'),
          deps.publicUrl,
        ),
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
    const link = linkTo(deps, request.id, 'connection_accepted', '/contact')

    await deps.mailer.send({
      memberId: request.requesterId,
      aboutMemberId: request.targetId,
      to,
      kind: 'connection_accepted',
      subject: `${by} accepted your request on Rebel Match`,
      ...renderMail({
        heading: `${by} accepted your request`,
        preview: "You can now see each other's email address.",
        blocks: [
          {
            kind: 'paragraph',
            text: `${by} accepted your request to connect on Rebel Match.`,
          },
          {
            kind: 'action',
            action: {
              label: 'Get in touch',
              prompt:
                "You can now see each other's email address. Get in touch here:",
              url: link,
            },
          },
        ],
        footer: noticeFooter(deps.publicUrl),
      }),
    })
  }
}

function addedMail(
  name: string,
  message: string | null,
  link: string,
  publicUrl: string,
): MailContent {
  return {
    heading: `${name} connected with you again`,
    preview: `${name} connected with you over another challenge.`,
    blocks: [
      {
        kind: 'paragraph',
        text: `${name} connected with you over another challenge on Rebel Match.`,
      },
      ...noteBlocks(message),
      {
        kind: 'action',
        action: {
          label: 'See your connection',
          prompt: 'See what you are connected over here:',
          url: link,
        },
      },
    ],
    footer: noticeFooter(publicUrl),
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
      subject: `${from} connected with you over another challenge`,
      ...renderMail(
        addedMail(
          from,
          request.message,
          linkTo(deps, request.id, 'connection_added', '/contact'),
          deps.publicUrl,
        ),
      ),
    })
  }
}
