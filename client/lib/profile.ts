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

/** What became of deleting one's own account (R-PROF-2). */
export type DeleteOutcome = 'deleted' | 'last-admin' | 'created-invites'

/** Erases the member's own account; a refusal comes back as its reason,
 * anything else unexpected throws, so a failure is never shown as done. */
export async function deleteAccount(): Promise<DeleteOutcome> {
  const response = await fetch('/api/profile', { method: 'DELETE' })
  if (response.status === 204) return 'deleted'
  if (response.status === 409) {
    const { result } = (await response.json()) as { result?: string }
    if (result === 'last_admin') return 'last-admin'
    if (result === 'created_invites') return 'created-invites'
  }
  throw new Error(`deleting the account failed (${String(response.status)})`)
}
