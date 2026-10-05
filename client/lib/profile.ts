import type { OwnProfile, ProfileEdit } from '../../src/services/profile'

export type { OwnProfile, ProfileEdit }

export async function fetchProfile(): Promise<OwnProfile> {
  const response = await fetch('/api/profile')
  if (!response.ok)
    throw new Error(`profile unavailable (${String(response.status)})`)
  return (await response.json()) as OwnProfile
}

/** Saves the profile as it now stands (R-PROF-1). Throws on anything but a
 * save, so a failure is never shown as saved. */
export async function saveProfile(edit: ProfileEdit): Promise<void> {
  const response = await fetch('/api/profile', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(edit),
  })
  if (!response.ok)
    throw new Error(`profile not saved (${String(response.status)})`)
}

/** What became of deleting one's own account (R-PROF-2): deleted, and when
 * it will be erased, or why it stays (ADR 0032). */
export type DeleteOutcome =
  | { result: 'deleted'; eraseAfter: string }
  | { result: 'last-admin' | 'created-invites' }

/** Deletes the member's own account, to be erased after the grace period; a
 * refusal comes back as its reason, anything else unexpected throws, so a
 * failure is never shown as done. */
export async function deleteAccount(): Promise<DeleteOutcome> {
  const response = await fetch('/api/profile', { method: 'DELETE' })
  if (response.ok) {
    const { eraseAfter } = (await response.json()) as { eraseAfter: string }
    return { result: 'deleted', eraseAfter }
  }
  if (response.status === 409) {
    const { result } = (await response.json()) as { result?: string }
    if (result === 'last_admin') return { result: 'last-admin' }
    if (result === 'created_invites') return { result: 'created-invites' }
  }
  throw new Error(`deleting the account failed (${String(response.status)})`)
}
