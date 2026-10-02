import { rolePermissions, type Permission, type RoleKey } from './access.js'

/** Where permissions come from (ADR 0021). Guards and the auth seam receive
 * this, never the matrix, so the matrix can move without touching them. */
export interface PermissionPolicy {
  /** The union of these roles' permissions; an unknown role grants nothing,
   * so a missing mapping denies (R-ROLE-2, R-ROLE-3, constitution §5). */
  permissionsOf(roles: readonly string[]): Permission[]
  /** Whether a role exists, so only known roles can be granted (ADR 0021). */
  knowsRole(role: string): boolean
  /** The roles that carry a permission, to tell whether anyone would still
   * hold it after a revocation (ADR 0021). */
  rolesGranting(permission: Permission): string[]
}

function isRoleKey(role: string): role is RoleKey {
  return Object.hasOwn(rolePermissions, role)
}

/** The policy backed by the reviewed matrix in config (ADR 0006). */
export const configPolicy: PermissionPolicy = {
  permissionsOf: (roles) => {
    const granted = new Set<Permission>()
    for (const role of roles.filter(isRoleKey)) {
      for (const permission of rolePermissions[role]) granted.add(permission)
    }
    return [...granted].sort()
  },
  knowsRole: isRoleKey,
  rolesGranting: (permission) =>
    Object.entries(rolePermissions)
      .filter(([, granted]) =>
        (granted as readonly string[]).includes(permission),
      )
      .map(([role]) => role),
}
