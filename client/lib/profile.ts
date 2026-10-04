import type { OwnProfile, ProfileEdit } from '../../src/services/profile'

export type { OwnProfile }

/** The profile as the form sends it: every field, a blank optional one
 * cleared (R-PROF-1). */
export type ProfileAnswers = Record<keyof ProfileEdit, string>

export async function fetchProfile(): Promise<OwnProfile> {
  const response = await fetch('/api/profile')
  if (!response.ok)
    throw new Error(`profile unavailable (${String(response.status)})`)
  return (await response.json()) as OwnProfile
}

/** Saves the profile as it now stands (R-PROF-1). Throws on anything but a
 * save, so a failure is never shown as saved. */
export async function saveProfile(edit: ProfileAnswers): Promise<void> {
  const response = await fetch('/api/profile', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(edit),
  })
  if (!response.ok)
    throw new Error(`profile not saved (${String(response.status)})`)
}
