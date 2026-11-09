// Each endpoint's outcomes and the status that answers each one, free of
// server dependencies so the server replies by them and the client reads its
// answers from the same tables: one wire contract, stated once.

/** `POST /api/challenges/:id/withdraw` (R-ASK-17). */
export const withdrawStatus = { withdrawn: 204, not_found: 404 } as const

/** Hiding a challenge or a request's note (R-MOD-8). */
export const hideStatus = { hidden: 204, not_found: 404 } as const

/** Showing a hidden challenge or note again (R-MOD-8). */
export const unhideStatus = { shown: 204, not_found: 404 } as const

/** `POST /api/admin/reports/dismiss` (R-MOD-7). */
export const dismissStatus = { dismissed: 204, not_found: 404 } as const

/** `POST /api/admin/members/:id/ban` (R-MOD-9). */
export const banStatus = {
  banned: 204,
  not_found: 404,
  self: 409,
  last_admin: 409,
} as const

/** `POST /api/admin/members/:id/unban` (R-MOD-9). */
export const unbanStatus = { unbanned: 204, not_found: 404 } as const

/** `POST /api/admin/applicants/:id/approve` (R-AUTH-11). */
export const approveStatus = {
  approved: 204,
  not_pending: 404,
  link_failed: 502,
} as const

/** `POST /api/admin/applicants/:id/reject` (R-AUTH-11). */
export const rejectStatus = { rejected: 204, not_pending: 404 } as const

/** `POST /api/admin/members/:id/roles` (R-ROLE-9). */
export const grantStatus = {
  granted: 204,
  unknown_role: 400,
  no_member: 404,
} as const

/** `DELETE /api/admin/members/:id/roles/:role` (R-ROLE-9). */
export const revokeStatus = {
  revoked: 204,
  unknown_role: 400,
  not_held: 404,
  last_holder: 409,
} as const

/** `POST /api/reports` (R-MOD-3, R-MOD-4). */
export const reportStatus = {
  reported: 204,
  not_found: 404,
  already_reported: 409,
  too_many: 429,
} as const
