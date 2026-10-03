import type { AuthProvider } from '../auth/index.js'

/** A pending request as the host sees it (R-AUTH-11). */
export interface PendingApplicant {
  id: string
  email: string
  requestedAt: string
  name: string | null
  org: string | null
}

export interface ApprovalStore {
  listPending(): Promise<PendingApplicant[]>
  /** Makes a pending applicant active with the role, recording who approved;
   * their address, or null when no pending applicant has that id. */
  approve(id: string, role: string, approvedBy: string): Promise<string | null>
  /** Marks a pending applicant rejected; false when none has that id. */
  reject(id: string): Promise<boolean>
}

export type ApproveOutcome = 'approved' | 'not_pending' | 'link_failed'

export interface ApprovalService {
  listPending(): Promise<PendingApplicant[]>
  approve(id: string, approvedBy: string): Promise<ApproveOutcome>
  reject(id: string): Promise<'rejected' | 'not_pending'>
}

/** F10: approving admits the applicant and emails the approval link straight
 * away (R-AUTH-3, R-AUTH-10). A link that could not be sent leaves them
 * admitted and says so, since they can still ask for one at the login screen. */
export function createApprovals(deps: {
  store: ApprovalStore
  auth: Pick<AuthProvider, 'issueLink'>
  admittedRole: string
}): ApprovalService {
  return {
    listPending: () => deps.store.listPending(),
    approve: async (id, approvedBy) => {
      const email = await deps.store.approve(id, deps.admittedRole, approvedBy)
      if (email === null) return 'not_pending'
      try {
        await deps.auth.issueLink(email, { kind: 'approval' })
      } catch {
        return 'link_failed'
      }
      return 'approved'
    },
    reject: async (id) =>
      (await deps.store.reject(id)) ? 'rejected' : 'not_pending',
  }
}
