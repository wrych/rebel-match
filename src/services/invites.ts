import { randomBytes } from 'node:crypto'
import { eventRow } from '../badges/rows.js'
import type { Track } from './analytics.js'
import type { LogoOutcome } from './logo.js'

/** An event's badge as the host tools show it: its words, and whether it has
 * a logo, served apart (R-BADGE-4, R-BADGE-5). */
export interface EventBadgeView {
  id: string
  name: string
  ticketLine: string
  bigLine: string
  hasLogo: boolean
}

/** A new event badge, its logo as uploaded and not yet cleaned. */
export interface NewEventBadge {
  name: string
  ticketLine: string
  bigLine: string
  logoSvg?: string | undefined
}

/** An invite as stored (design §2). The token is a public capability, kept in
 * clear so the QR can be re-rendered (ADR 0014). */
export interface Invite {
  id: string
  token: string
  label: string
  validFrom: Date
  validUntil: Date
  maxUses: number
  uses: number
  revokedAt: Date | null
  eventBadgeId: string | null
  createdBy: string
  createdAt: Date
}

/** An invite as listed, with who created it (R-INV-8). */
export interface ListedInvite extends Invite {
  creatorEmail: string
  /** Times its link was opened, with nothing about who (R-STAT-6). */
  opens: number
  eventBadge: EventBadgeView | null
}

export type InviteState =
  'active' | 'scheduled' | 'expired' | 'revoked' | 'exhausted'

/** An invite's state at `now` (R-INV-9). Only `active` admits anyone
 * (R-INV-2,3,4); a revoked or full invite reads as such whatever its window. */
export function inviteState(
  invite: Pick<
    Invite,
    'validFrom' | 'validUntil' | 'maxUses' | 'uses' | 'revokedAt'
  >,
  now: Date,
): InviteState {
  if (invite.revokedAt !== null) return 'revoked'
  if (invite.uses >= invite.maxUses) return 'exhausted'
  if (now < invite.validFrom) return 'scheduled'
  if (now >= invite.validUntil) return 'expired'
  return 'active'
}

/** An invite as the admin screen shows it. */
export interface InviteView {
  id: string
  label: string
  validFrom: string
  validUntil: string
  maxUses: number
  uses: number
  opens: number
  state: InviteState
  joinUrl: string
  createdBy: string
  createdAt: string
  eventBadge: EventBadgeView | null
}

export interface NewInvite {
  label: string
  validFrom?: Date | undefined
  validUntil?: Date | undefined
  maxUses?: number | undefined
  /** Another invite's badge, so every poster of one event gives the same. */
  eventBadgeId?: string | undefined
  eventBadge?: NewEventBadge | undefined
}

/** The badge an invite is to give: another invite's, a new one, or with
 * neither, none (R-BADGE-4). */
export type BadgeChoice = Pick<NewInvite, 'eventBadgeId' | 'eventBadge'>

export interface InviteStore {
  /** Every invite, newest first. */
  list(): Promise<ListedInvite[]>
  find(id: string): Promise<ListedInvite | null>
  /** Stores the invite, with its new event badge first when it brings one,
   * in one transaction. */
  insert(
    invite: Omit<Invite, 'uses' | 'revokedAt' | 'createdAt'>,
    newBadge: StoredEventBadge | null,
  ): Promise<void>
  badgeExists(id: string): Promise<boolean>
  /** A badge's cleaned logo, or null for none or no such badge. */
  logo(badgeId: string): Promise<string | null>
  /** Sets the badge an invite gives, storing a new one first, and records it
   * as earned by the active members it admitted, with their notifications,
   * in one transaction. The members who newly earned it, or null for no such
   * invite. */
  setBadge(
    inviteId: string,
    badgeId: string | null,
    newBadge: StoredEventBadge | null,
  ): Promise<string[] | null>
  /** Sets `revoked_at` once; false when no invite has that id. */
  revoke(id: string, at: Date): Promise<boolean>
  /** Sets a higher cap on an invite that is not revoked, in one statement;
   * false when nothing was changed. */
  raiseCap(id: string, maxUses: number): Promise<boolean>
}

/** An event badge as stored, its logo cleaned (R-BADGE-5). */
export interface StoredEventBadge {
  id: string
  name: string
  ticketLine: string
  bigLine: string
  logoSvg: string | null
}

export type CreateOutcome =
  | { result: 'created'; invite: InviteView }
  | { result: 'bad_window' | 'bad_logo' | 'unknown_badge' }

export type BadgeOutcome =
  | { result: 'set'; invite: InviteView }
  | { result: 'not_found' | 'bad_logo' | 'unknown_badge' }

export type RaiseOutcome =
  | { result: 'raised'; invite: InviteView }
  | { result: 'not_found' | 'revoked' | 'not_higher' }

export interface InviteService {
  list(): Promise<InviteView[]>
  create(input: NewInvite, createdBy: string): Promise<CreateOutcome>
  revoke(id: string): Promise<'revoked' | 'not_found'>
  /** Gives an invite made earlier a badge, changes it or removes it; those
   * it admitted earn it now, and nobody loses one (R-INV-13). */
  setBadge(id: string, choice: BadgeChoice): Promise<BadgeOutcome>
  /** Raises the cap, so a printed code keeps admitting (R-INV-4). */
  raiseCap(id: string, maxUses: number): Promise<RaiseOutcome>
  /** An event badge's cleaned logo, for its own address (R-BADGE-5). */
  logo(badgeId: string): Promise<string | null>
}

const MS_PER_HOUR = 3_600_000
const MS_PER_SECOND = 1000

// DATETIME keeps whole seconds and rounds the rest, so a window starting
// "now" could be stored in the future and read back as scheduled.
function wholeSecond(date: Date): Date {
  return new Date(Math.floor(date.getTime() / MS_PER_SECOND) * MS_PER_SECOND)
}

// 18 random bytes is 24 URL-safe characters: short enough for a QR on a
// badge, and still too many to guess.
const TOKEN_BYTES = 18

function newToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url')
}

export function joinUrl(publicUrl: string, token: string): string {
  const url = new URL('/', publicUrl)
  url.searchParams.set('invite', token)
  return url.toString()
}

function view(invite: ListedInvite, publicUrl: string, now: Date): InviteView {
  return {
    id: invite.id,
    label: invite.label,
    validFrom: invite.validFrom.toISOString(),
    validUntil: invite.validUntil.toISOString(),
    maxUses: invite.maxUses,
    uses: invite.uses,
    opens: invite.opens,
    state: inviteState(invite, now),
    joinUrl: joinUrl(publicUrl, invite.token),
    createdBy: invite.creatorEmail,
    createdAt: invite.createdAt.toISOString(),
    eventBadge: invite.eventBadge,
  }
}

type CleanLogo = (text: string) => LogoOutcome

// The badge an invite brings: none, an existing one, or a new one whose logo
// is cleaned to drawing only before anything is stored (R-BADGE-4,5).
async function badgeFor(
  input: BadgeChoice,
  deps: { store: InviteStore; cleanLogo: CleanLogo; newId: () => string },
): Promise<
  | { id: string | null; stored: StoredEventBadge | null }
  | 'bad_logo'
  | 'unknown_badge'
> {
  if (input.eventBadgeId !== undefined)
    return (await deps.store.badgeExists(input.eventBadgeId))
      ? { id: input.eventBadgeId, stored: null }
      : 'unknown_badge'
  const badge = input.eventBadge
  if (badge === undefined) return { id: null, stored: null }
  let logoSvg: string | null = null
  if (badge.logoSvg !== undefined) {
    const cleaned = deps.cleanLogo(badge.logoSvg)
    if (cleaned.result === 'refused') return 'bad_logo'
    logoSvg = cleaned.svg
  }
  const id = deps.newId()
  return {
    id,
    stored: {
      id,
      name: badge.name,
      ticketLine: badge.ticketLine,
      bigLine: badge.bigLine,
      logoSvg,
    },
  }
}

type InviteDeps = Parameters<typeof createInvites>[0]

async function createInvite(
  deps: InviteDeps,
  at: Date,
  input: NewInvite,
  createdBy: string,
): Promise<CreateOutcome> {
  const defaults = deps.defaults()
  const validFrom = wholeSecond(input.validFrom ?? at)
  const validUntil = wholeSecond(
    input.validUntil ??
      new Date(validFrom.getTime() + defaults.inviteDefaultHours * MS_PER_HOUR),
  )
  if (validUntil <= validFrom) return { result: 'bad_window' }
  const badge = await badgeFor(input, deps)
  if (typeof badge === 'string') return { result: badge }

  const invite = {
    id: deps.newId(),
    token: newToken(),
    label: input.label,
    validFrom,
    validUntil,
    maxUses: input.maxUses ?? defaults.inviteDefaultMaxUses,
    eventBadgeId: badge.id,
    createdBy,
  }
  await deps.store.insert(invite, badge.stored)
  const stored = await deps.store.find(invite.id)
  if (stored === null) throw new Error('invite vanished after insert')
  return { result: 'created', invite: view(stored, deps.publicUrl, at) }
}

// Each member newly holding the badge is reported as earning it, as when
// they join or claim it (R-BADGE-13).
async function setBadge(
  deps: InviteDeps,
  at: Date,
  id: string,
  choice: BadgeChoice,
): Promise<BadgeOutcome> {
  const badge = await badgeFor(choice, deps)
  if (typeof badge === 'string') return { result: badge }
  const earned = await deps.store.setBadge(id, badge.id, badge.stored)
  const invite = await deps.store.find(id)
  if (earned === null || invite === null) return { result: 'not_found' }
  for (const memberId of earned)
    void deps.track(memberId, { name: 'badge_earned', row: eventRow })
  return { result: 'set', invite: view(invite, deps.publicUrl, at) }
}

/** F16: list, create and revoke invites (R-INV-2,3,4,8,9,10). A window or cap
 * left out takes the configured default. */
export function createInvites(deps: {
  store: InviteStore
  publicUrl: string
  defaults: () => { inviteDefaultMaxUses: number; inviteDefaultHours: number }
  now?: () => Date
  newId: () => string
  cleanLogo: CleanLogo
  track: Track
}): InviteService {
  const now = deps.now ?? ((): Date => new Date())
  return {
    list: async () => {
      const at = now()
      return (await deps.store.list()).map((i) => view(i, deps.publicUrl, at))
    },
    create: (input, createdBy) => createInvite(deps, now(), input, createdBy),
    setBadge: (id, choice) => setBadge(deps, now(), id, choice),
    revoke: async (id) =>
      (await deps.store.revoke(id, now())) ? 'revoked' : 'not_found',
    raiseCap: async (id, maxUses) => {
      const raised = await deps.store.raiseCap(id, maxUses)
      const invite = await deps.store.find(id)
      if (invite === null) return { result: 'not_found' }
      if (raised)
        return { result: 'raised', invite: view(invite, deps.publicUrl, now()) }
      return { result: invite.revokedAt === null ? 'not_higher' : 'revoked' }
    },
    logo: (badgeId) => deps.store.logo(badgeId),
  }
}
