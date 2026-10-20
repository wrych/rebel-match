import { ensureOk, getJson, jsonOf, send } from './request'

export type InviteState =
  'active' | 'scheduled' | 'expired' | 'revoked' | 'exhausted'

/** An invite as `GET /api/admin/invites` sends it (R-INV-9). */
export interface Invite {
  id: string
  label: string
  validFrom: string
  validUntil: string
  maxUses: number
  uses: number
  /** Times its link was opened (R-STAT-6). */
  opens: number
  state: InviteState
  joinUrl: string
  createdBy: string
  createdAt: string
  /** The event badge joining through it earns, if any (R-INV-13). */
  eventBadge: EventBadge | null
}

/** An event's badge as the host tools list it (R-BADGE-4). */
export interface EventBadge {
  id: string
  name: string
  ticketLine: string
  bigLine: string
  hasLogo: boolean
}

/** What a new invite gives: no badge, a new one, or another invite's. */
export type BadgeChoice =
  | { kind: 'none' }
  | {
      kind: 'new'
      name: string
      ticketLine: string
      bigLine: string
      /** The SVG as uploaded; the server cleans it (R-BADGE-5). */
      logoSvg: string | null
    }
  | { kind: 'same'; id: string }

export interface InviteDraft {
  label: string
  validFrom: string
  validUntil: string
  maxUses: string
  badge: BadgeChoice
}

/** Where an event badge's cleaned logo is served (R-BADGE-5). */
export function logoUrl(badge: Pick<EventBadge, 'id'>): string {
  return `/api/event-badges/${encodeURIComponent(badge.id)}/logo.svg`
}

/** Each event badge once, as the invites carry them, newest first. */
export function badgesOf(invites: readonly Invite[]): EventBadge[] {
  const seen = new Map<string, EventBadge>()
  for (const invite of invites)
    if (invite.eventBadge !== null && !seen.has(invite.eventBadge.id))
      seen.set(invite.eventBadge.id, invite.eventBadge)
  return [...seen.values()]
}

function badgeFields(
  badge: BadgeChoice,
): { eventBadgeId: string } | { eventBadge: object } | object {
  if (badge.kind === 'same') return { eventBadgeId: badge.id }
  if (badge.kind === 'none') return {}
  return {
    eventBadge: {
      name: badge.name,
      ticketLine: badge.ticketLine,
      bigLine: badge.bigLine,
      ...(badge.logoSvg === null ? {} : { logoSvg: badge.logoSvg }),
    },
  }
}

const refusals = {
  bad_window: 'bad-window',
  bad_logo: 'bad-logo',
  unknown_badge: 'bad-badge',
} as const

type Refusal = (typeof refusals)[keyof typeof refusals]

export async function fetchInvites(): Promise<Invite[]> {
  const { invites } = await getJson<{ invites: Invite[] }>(
    '/api/admin/invites',
    'invites unavailable',
  )
  return invites
}

// A host types a day as YYYY-MM-DD (e.g. 2026-11-08), optionally with a time
// (2026-11-08 09:00), read as their local wall time. A bare day opens at its
// first moment and, as an end, closes at the next midnight so the whole day
// counts. Anything else, or a day the calendar lacks, is null.
const DAY = /^(\d{4})-(\d{2})-(\d{2})(?:[ T]([01]\d|2[0-3]):([0-5]\d))?$/

export function parseDay(text: string, end = false): Date | null {
  const match = DAY.exec(text.trim())
  if (match === null) return null
  const [year, month, date] = [match[1], match[2], match[3]].map(Number) as [
    number,
    number,
    number,
  ]
  const timed = match[4] !== undefined
  const hour = timed ? Number(match[4]) : 0
  const minute = timed ? Number(match[5]) : 0
  const day = new Date(year, month - 1, date)
  if (day.getMonth() !== month - 1 || day.getDate() !== date) return null
  return new Date(year, month - 1, date + (end && !timed ? 1 : 0), hour, minute)
}

function instant(text: string, end: boolean): string | undefined | null {
  if (text.trim() === '') return undefined
  return parseDay(text, end)?.toISOString() ?? null
}

/** Creates an invite; blanks take the server's defaults (R-INV-2,4). 'bad
 * date' when a day is not YYYY-MM-DD, 'bad-window' when it would end before
 * it starts, 'bad-logo' for a logo the server refused, 'bad-badge' for a
 * badge that is gone (R-BADGE-4,5). */
export async function createInvite(
  draft: InviteDraft,
): Promise<Invite | 'bad-date' | Refusal> {
  const validFrom = instant(draft.validFrom, false)
  const validUntil = instant(draft.validUntil, true)
  if (validFrom === null || validUntil === null) return 'bad-date'
  const response = await send('/api/admin/invites', 'POST', {
    label: draft.label,
    validFrom,
    validUntil,
    maxUses: draft.maxUses === '' ? undefined : Number(draft.maxUses),
    ...badgeFields(draft.badge),
  })
  if (response.status === 400) {
    const { error } = (await response.json()) as { error?: string }
    const refusal = refusals[error as keyof typeof refusals] as
      Refusal | undefined
    if (refusal !== undefined) return refusal
  }
  return (await jsonOf<{ invite: Invite }>(response, 'invite not created'))
    .invite
}

/** Gives an invite made earlier the chosen badge, or none; those it admitted
 * earn it now (R-INV-13). 'bad-logo' for a logo the server refused,
 * 'bad-badge' for a badge that is gone. */
export async function setInviteBadge(
  id: string,
  badge: BadgeChoice,
): Promise<Invite | 'bad-logo' | 'bad-badge'> {
  const response = await send(
    `/api/admin/invites/${encodeURIComponent(id)}/event-badge`,
    'PUT',
    badgeFields(badge),
  )
  if (response.status === 400) {
    const { error } = (await response.json()) as { error?: string }
    if (error === 'bad_logo') return 'bad-logo'
    if (error === 'unknown_badge') return 'bad-badge'
  }
  return (await jsonOf<{ invite: Invite }>(response, 'badge not set')).invite
}

/** Raises an invite's cap so its printed code keeps admitting (R-INV-4):
 * 'bad-cap' for a cap that is not higher or over the ceiling, 'revoked' for
 * a revoked invite. */
export async function raiseCap(
  id: string,
  maxUses: number,
): Promise<Invite | 'bad-cap' | 'revoked'> {
  const response = await send(
    `/api/admin/invites/${encodeURIComponent(id)}`,
    'PATCH',
    { maxUses },
  )
  if (response.status === 400) return 'bad-cap'
  if (response.status === 409) return 'revoked'
  return (await jsonOf<{ invite: Invite }>(response, 'cap not raised')).invite
}

export async function revokeInvite(id: string): Promise<void> {
  const response = await send(
    `/api/admin/invites/${encodeURIComponent(id)}/revoke`,
    'POST',
  )
  ensureOk(response, 'invite not revoked')
}
