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
}

export interface InviteDraft {
  label: string
  validFrom: string
  validUntil: string
  maxUses: string
}

export async function fetchInvites(): Promise<Invite[]> {
  const response = await fetch('/api/admin/invites')
  if (!response.ok)
    throw new Error(`invites unavailable (${String(response.status)})`)
  return ((await response.json()) as { invites: Invite[] }).invites
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
 * it starts. */
export async function createInvite(
  draft: InviteDraft,
): Promise<Invite | 'bad-date' | 'bad-window'> {
  const validFrom = instant(draft.validFrom, false)
  const validUntil = instant(draft.validUntil, true)
  if (validFrom === null || validUntil === null) return 'bad-date'
  const response = await fetch('/api/admin/invites', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      label: draft.label,
      validFrom,
      validUntil,
      maxUses: draft.maxUses === '' ? undefined : Number(draft.maxUses),
    }),
  })
  if (response.status === 400) {
    const body = (await response.json()) as { error?: string }
    if (body.error === 'bad_window') return 'bad-window'
  }
  if (!response.ok)
    throw new Error(`invite not created (${String(response.status)})`)
  return ((await response.json()) as { invite: Invite }).invite
}

/** Raises an invite's cap so its printed code keeps admitting (R-INV-4):
 * 'bad-cap' for a cap that is not higher or over the ceiling, 'revoked' for
 * a revoked invite. */
export async function raiseCap(
  id: string,
  maxUses: number,
): Promise<Invite | 'bad-cap' | 'revoked'> {
  const response = await fetch(`/api/admin/invites/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ maxUses }),
  })
  if (response.status === 400) return 'bad-cap'
  if (response.status === 409) return 'revoked'
  if (!response.ok)
    throw new Error(`cap not raised (${String(response.status)})`)
  return ((await response.json()) as { invite: Invite }).invite
}

export async function revokeInvite(id: string): Promise<void> {
  const response = await fetch(
    `/api/admin/invites/${encodeURIComponent(id)}/revoke`,
    { method: 'POST' },
  )
  if (!response.ok)
    throw new Error(`invite not revoked (${String(response.status)})`)
}
