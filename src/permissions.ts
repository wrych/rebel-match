import { rolePermissions, type Permission, type RoleKey } from './config.js'

function isRoleKey(role: string): role is RoleKey {
  return Object.hasOwn(rolePermissions, role)
}

/** A member's effective permissions: the union of their roles' grants. A role
 * the matrix does not know grants nothing, so a missing mapping denies
 * (R-ROLE-2, R-ROLE-3, constitution §5). */
export function resolvePermissions(roles: readonly string[]): Permission[] {
  const granted = new Set<Permission>()

  for (const role of roles.filter(isRoleKey)) {
    for (const permission of rolePermissions[role]) granted.add(permission)
  }

  return [...granted].sort()
}
