/** One member as the erasure screen lists them (R-NFR-7): enough to find the
 * person who asked to be removed, and to see whether they hold a role. */
export interface RosterMember {
  id: string
  email: string
  name: string | null
  status: 'applicant' | 'active' | 'rejected' | 'deleted'
  roles: string[]
  joinedAt: string
}

export interface MemberRoster {
  /** Everyone in the members table, by email. */
  list(): Promise<RosterMember[]>
}
