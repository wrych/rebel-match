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

// A datetime-local value is local wall time with no zone; the server wants an
// instant, so it is read as local time and sent as ISO.
function instant(local: string): string | undefined {
  return local === '' ? undefined : new Date(local).toISOString()
}

/** Creates an invite; blanks take the server's defaults (R-INV-2,4). 'bad
 * window' when it would end before it starts. */
export async function createInvite(
  draft: InviteDraft,
): Promise<Invite | 'bad-window'> {
  const response = await fetch('/api/admin/invites', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      label: draft.label,
      validFrom: instant(draft.validFrom),
      validUntil: instant(draft.validUntil),
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

export async function revokeInvite(id: string): Promise<void> {
  const response = await fetch(
    `/api/admin/invites/${encodeURIComponent(id)}/revoke`,
    { method: 'POST' },
  )
  if (!response.ok)
    throw new Error(`invite not revoked (${String(response.status)})`)
}
