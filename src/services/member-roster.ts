/** One member as the host tools list them (R-MEM-1, R-NFR-7): the lines the
 * app shows a person by, and enough to find who asked to be removed. */
export interface RosterMember {
  id: string
  email: string
  name: string | null
  jobTitle: string | null
  org: string | null
  sector: string | null
  status: 'applicant' | 'active' | 'rejected' | 'deleted'
  roles: string[]
  joinedAt: string
  /** For a deleted account: when it will be erased, and whether its member
   * deleted it, so only a host can undo it otherwise (ADR 0032). */
  eraseAfter: string | null
  deletedBySelf: boolean | null
}

/** Everything held about one member, for their page (R-MEM-2). */
export interface MemberDetail extends RosterMember {
  /** What an applicant said about themselves when asking to join. */
  requestedName: string | null
  requestedOrg: string | null
  /** The label of the invite they joined through, if any. */
  joinedVia: string | null
  consentVersion: string | null
  consentAt: string | null
  analyticsOptIn: boolean
  challenges: number
  requestsSent: number
  requestsReceived: number
}

export interface MemberRoster {
  /** Everyone in the members table, by email. */
  list(): Promise<RosterMember[]>
  /** One member's page; null when there is no such member. */
  detail(id: string): Promise<MemberDetail | null>
}
