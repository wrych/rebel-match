import type {
  MemberDetail,
  RosterMember,
} from '../../src/services/member-roster'

export type { MemberDetail, RosterMember }

/** What became of an erasure, as the host needs to hear it. */
export type EraseOutcome = 'erased' | 'gone' | 'created-invites' | 'last-admin'

export async function fetchMembers(): Promise<RosterMember[]> {
  const response = await fetch('/api/admin/members')
  if (!response.ok)
    throw new Error(`members unavailable (${String(response.status)})`)
  return ((await response.json()) as { members: RosterMember[] }).members
}

/** One member's page (R-MEM-2); null when there is no such member. */
export async function fetchMember(id: string): Promise<MemberDetail | null> {
  const response = await fetch(`/api/admin/members/${encodeURIComponent(id)}`)
  if (response.status === 404) return null
  if (!response.ok)
    throw new Error(`member unavailable (${String(response.status)})`)
  return ((await response.json()) as { member: MemberDetail }).member
}

/** What became of giving or taking away a role (R-ROLE-9). */
export type RoleOutcome = 'done' | 'gone' | 'last-holder'

/** Gives a member a role; 'gone' when they are no longer an active member. */
export async function grantRole(
  id: string,
  role: string,
): Promise<RoleOutcome> {
  const response = await fetch(
    `/api/admin/members/${encodeURIComponent(id)}/roles`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role }),
    },
  )
  if (response.status === 204) return 'done'
  if (response.status === 404) return 'gone'
  throw new Error(`granting failed (${String(response.status)})`)
}

/** Takes a role away; 'last-holder' when nobody else could grant roles. */
export async function revokeRole(
  id: string,
  role: string,
): Promise<RoleOutcome> {
  const response = await fetch(
    `/api/admin/members/${encodeURIComponent(id)}/roles/${encodeURIComponent(role)}`,
    { method: 'DELETE' },
  )
  if (response.status === 204) return 'done'
  if (response.status === 404) return 'gone'
  if (response.status === 409) return 'last-holder'
  throw new Error(`revoking failed (${String(response.status)})`)
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
