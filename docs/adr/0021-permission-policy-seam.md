# 0021. Read permissions through a policy seam

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** Andy Moesch

## Context

ADR 0006 keeps the role → permission matrix in config, so every grant is
reviewed in a pull request. That stays right for the beta. But the auth seam
imports the matrix directly to resolve a member's permissions, and granting
roles — the next admin feature — needs to ask the same matrix which roles exist
and which roles carry a given permission. If each of those reads `config` itself,
moving the matrix into the database later means finding and rewriting every
one of them.

## Decision

This amends ADR 0006; the matrix stays in config.

Everything that needs the matrix receives a `PermissionPolicy` and never imports
the matrix:

```ts
interface PermissionPolicy {
  /** The union of these roles' permissions; unknown roles grant nothing. */
  permissionsOf(roles: readonly string[]): Permission[]
  /** Whether a role exists, so only known roles can be granted. */
  knowsRole(role: string): boolean
  /** The roles that carry a permission, for "would anyone still hold it?". */
  rolesGranting(permission: Permission): string[]
}
```

Today one implementation reads `config.rolePermissions`. A database-backed
policy would be a second implementation, wired in `compose.ts`, with no guard,
route or service changed.

Permissions are renamed `resource:action` at the same time (R-ROLE-10):
`challenge:swipe` and `connection:request` replace `swipe` and `connect`.

## Alternatives considered

- **Move the matrix into the database now** — gives runtime editing nobody has
  asked for, and loses review of grants in a PR, which ADR 0006 chose on
  purpose.
- **Leave the direct import** — cheapest today; the cost arrives all at once,
  on the day it moves.

## Consequences

- The policy is synchronous because the config matrix is. A database policy
  would either load the matrix at startup or make the interface async — a
  change to this ADR's interface, but still one module's worth.
- `Permission` stays a type derived from the matrix, so a typo in a guard does
  not compile. A database-backed matrix would lose that, which is the strongest
  reason to keep it in config.

## References

Requirements: R-ROLE-2,3,5,6,10. Amends ADR 0006. Spec: `specs/design.md` §2.
