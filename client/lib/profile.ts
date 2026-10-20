import type { OwnProfile, ProfileEdit } from '../../src/services/profile'
import { ensureOk, failure, getJson, send } from './request'

export type { OwnProfile }

/** The profile as the form sends it: every field, a blank optional one
 * cleared (R-PROF-1). */
export type ProfileAnswers = Record<keyof ProfileEdit, string>

export async function fetchProfile(): Promise<OwnProfile> {
  return getJson<OwnProfile>('/api/profile', 'profile unavailable')
}

/** Saves the profile as it now stands (R-PROF-1). Throws on anything but a
 * save, so a failure is never shown as saved. */
export async function saveProfile(edit: ProfileAnswers): Promise<void> {
  ensureOk(await send('/api/profile', 'PUT', edit), 'profile not saved')
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
  const response = await send('/api/profile', 'DELETE')
  if (response.ok) {
    const { eraseAfter } = (await response.json()) as { eraseAfter: string }
    return { result: 'deleted', eraseAfter }
  }
  if (response.status === 409) {
    const { result } = (await response.json()) as { result?: string }
    if (result === 'last_admin') return { result: 'last-admin' }
    if (result === 'created_invites') return { result: 'created-invites' }
  }
  throw failure('deleting the account failed', response)
}

/** Deletes the member's activity history, nothing else (R-STAT-4). Throws
 * when it did not happen, so a failure is never shown as done. */
export async function deleteHistory(): Promise<void> {
  const response = await send('/api/me/history', 'DELETE')
  ensureOk(response, 'deleting the history failed')
}
