/** Each role's permissions, free of server dependencies so the client's route
 * table can name them. A member's access is the union of their roles' grants,
 * resolved per request — never a role-name check (R-ROLE-2, R-ROLE-3). */
export const rolePermissions = {
  member: ['challenge:create', 'challenge:swipe', 'connection:request'],
  admin: [
    'applicant:review',
    'whitelist:manage',
    'member:delete',
    'challenge:moderate',
    'invite:manage',
    'outbox:read',
  ],
} as const satisfies Record<string, readonly string[]>

export type RoleKey = keyof typeof rolePermissions
export type Permission =
  (typeof rolePermissions)[RoleKey][number] extends infer P
    ? P extends string
      ? P
      : never
    : never
