import { randomBytes } from 'node:crypto'

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
  createdBy: string
  createdAt: Date
}

/** An invite as listed, with who created it (R-INV-8). */
export interface ListedInvite extends Invite {
  creatorEmail: string
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
  state: InviteState
  joinUrl: string
  createdBy: string
  createdAt: string
}

export interface NewInvite {
  label: string
  validFrom?: Date | undefined
  validUntil?: Date | undefined
  maxUses?: number | undefined
}

export interface InviteStore {
  /** Every invite, newest first. */
  list(): Promise<ListedInvite[]>
  find(id: string): Promise<ListedInvite | null>
  insert(
    invite: Omit<Invite, 'uses' | 'revokedAt' | 'createdAt'>,
  ): Promise<void>
  /** Sets `revoked_at` once; false when no invite has that id. */
  revoke(id: string, at: Date): Promise<boolean>
}

export type CreateOutcome =
  { result: 'created'; invite: InviteView } | { result: 'bad_window' }

export interface InviteService {
  list(): Promise<InviteView[]>
  create(input: NewInvite, createdBy: string): Promise<CreateOutcome>
  revoke(id: string): Promise<'revoked' | 'not_found'>
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
    state: inviteState(invite, now),
    joinUrl: joinUrl(publicUrl, invite.token),
    createdBy: invite.creatorEmail,
    createdAt: invite.createdAt.toISOString(),
  }
}

/** F16: list, create and revoke invites (R-INV-2,3,4,8,9,10). A window or cap
 * left out takes the configured default. */
export function createInvites(deps: {
  store: InviteStore
  publicUrl: string
  defaults: () => { inviteDefaultMaxUses: number; inviteDefaultHours: number }
  now?: () => Date
  newId: () => string
}): InviteService {
  const now = deps.now ?? ((): Date => new Date())
  return {
    list: async () => {
      const at = now()
      return (await deps.store.list()).map((i) => view(i, deps.publicUrl, at))
    },
    create: async (input, createdBy) => {
      const at = now()
      const defaults = deps.defaults()
      const validFrom = wholeSecond(input.validFrom ?? at)
      const validUntil = wholeSecond(
        input.validUntil ??
          new Date(
            validFrom.getTime() + defaults.inviteDefaultHours * MS_PER_HOUR,
          ),
      )
      if (validUntil <= validFrom) return { result: 'bad_window' }

      const invite = {
        id: deps.newId(),
        token: newToken(),
        label: input.label,
        validFrom,
        validUntil,
        maxUses: input.maxUses ?? defaults.inviteDefaultMaxUses,
        createdBy,
      }
      await deps.store.insert(invite)
      const stored = await deps.store.find(invite.id)
      if (stored === null) throw new Error('invite vanished after insert')
      return { result: 'created', invite: view(stored, deps.publicUrl, at) }
    },
    revoke: async (id) =>
      (await deps.store.revoke(id, now())) ? 'revoked' : 'not_found',
  }
}
