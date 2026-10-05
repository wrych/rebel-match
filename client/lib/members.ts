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

type Refusal = 'gone' | 'created-invites' | 'last-admin'

async function refusalOf(response: Response): Promise<Refusal | null> {
  if (response.status === 404) return 'gone'
  if (response.status === 409) {
    const { result } = (await response.json()) as { result?: string }
    if (result === 'created_invites') return 'created-invites'
    if (result === 'last_admin') return 'last-admin'
  }
  return null
}

/** What deleting did: hidden now and erased on `eraseAfter`, or why the
 * member stays (ADR 0032). */
export type DeleteOutcome =
  { result: 'deleted'; eraseAfter: string } | { result: Refusal }

/** Deletes one member with the grace period: hidden at once, erased later
 * unless restored (R-NFR-7, ADR 0032). Throws on anything the host cannot act
 * on, so a failure is never shown as done. */
export async function deleteMember(id: string): Promise<DeleteOutcome> {
  const response = await fetch(`/api/admin/members/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (response.ok) {
    const { eraseAfter } = (await response.json()) as { eraseAfter: string }
    return { result: 'deleted', eraseAfter }
  }
  const refusal = await refusalOf(response)
  if (refusal !== null) return { result: refusal }
  throw new Error(`deleting failed (${String(response.status)})`)
}

/** Erases one member and their personal data at once, for someone who
 * insists (R-NFR-7). */
export async function eraseNow(id: string): Promise<EraseOutcome> {
  const response = await fetch(
    `/api/admin/members/${encodeURIComponent(id)}?now=true`,
    { method: 'DELETE' },
  )
  if (response.status === 204) return 'erased'
  const refusal = await refusalOf(response)
  if (refusal !== null) return refusal
  throw new Error(`erasure failed (${String(response.status)})`)
}

/** Undoes a deletion before it is erased; 'gone' when there was none to
 * undo (ADR 0032). */
export async function restoreMember(id: string): Promise<'restored' | 'gone'> {
  const response = await fetch(
    `/api/admin/members/${encodeURIComponent(id)}/restore`,
    { method: 'POST' },
  )
  if (response.status === 204) return 'restored'
  if (response.status === 404) return 'gone'
  throw new Error(`restoring failed (${String(response.status)})`)
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

/** One member's outcome of an action taken on several at once (R-MEM-3). */
export interface EachOutcome<T> {
  member: RosterMember
  outcome: T | 'failed'
}

/** Runs `action` for each member in turn, so one refusal or failure never
 * stops the rest; each outcome comes back beside its member (R-MEM-3). */
export async function forEachMember<T>(
  members: RosterMember[],
  action: (id: string) => Promise<T>,
): Promise<EachOutcome<T>[]> {
  const outcomes: EachOutcome<T>[] = []
  for (const member of members) {
    try {
      outcomes.push({ member, outcome: await action(member.id) })
    } catch {
      outcomes.push({ member, outcome: 'failed' })
    }
  }
  return outcomes
}
