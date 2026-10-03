import type { RosterMember } from '../../src/services/member-roster'

export type { RosterMember }

/** What became of an erasure, as the host needs to hear it. */
export type EraseOutcome = 'erased' | 'gone' | 'created-invites' | 'last-admin'

export async function fetchMembers(): Promise<RosterMember[]> {
  const response = await fetch('/api/admin/members')
  if (!response.ok)
    throw new Error(`members unavailable (${String(response.status)})`)
  return ((await response.json()) as { members: RosterMember[] }).members
}

/** Erases one member and their personal data (R-NFR-7). Throws on anything
 * the host cannot act on, so a failure is never shown as done. */
export async function eraseMember(id: string): Promise<EraseOutcome> {
  const response = await fetch(`/api/admin/members/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (response.status === 204) return 'erased'
  if (response.status === 404) return 'gone'
  if (response.status === 409) {
    const { result } = (await response.json()) as { result?: string }
    if (result === 'created_invites') return 'created-invites'
    if (result === 'last_admin') return 'last-admin'
  }
  throw new Error(`erasure failed (${String(response.status)})`)
}

/** True when the member's email or name contains the search, ignoring case. */
export function matchesSearch(member: RosterMember, search: string): boolean {
  const needle = search.trim().toLowerCase()
  return (
    needle === '' ||
    member.email.toLowerCase().includes(needle) ||
    (member.name ?? '').toLowerCase().includes(needle)
  )
}
