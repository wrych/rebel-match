# 0006. Role-based access control instead of an is_admin flag

- **Status:** Accepted
- **Date:** 2026-10-01
- **Deciders:** Andy Moesch

## Context

The first schema carried `members.is_admin`, a boolean. The beta needs exactly
two kinds of people, so a flag looked sufficient. But moderation is already on
the post-beta list, and a second flag means a third: every new kind of access
adds a column, and every guard that tested `is_admin` has to be found and
re-read. The concept breaks at the first addition.

The table also already had a `role` column — a member's job title — so "role"
meant two different things in one row.

## Decision

Access is modeled as named roles: a `roles` table and a `member_roles` join, so
a member can hold several at once and their permissions are the union.
Permissions live in the config module as a role → permission matrix, in version
control.

**Guards check a permission, never a role name**:
`requirePermission('applicant:review')`, not `if (member.isAdmin)`. Adding
`moderator` is one row plus one matrix column, with no guard rewritten and no
schema change.

The profile column is renamed `job_title`; "role" now means access role only.

## Alternatives considered

- **`is_admin` boolean** — breaks on the second role, which we already expect.
- **A single `role` enum column** — one role per member, so an admin stops being
  a member; and every addition is a migration.
- **Permissions in the database** — more flexible, but grants stop being
  reviewable in a pull request, which is where we want them.

## Consequences

- Two extra tables and a resolver to unit-test (R-QA-1).
- An admin is a member *plus* admin, never instead of one — they still post
  challenges.
- Grants are auditable: `granted_at` and `granted_by` are recorded.
- A role name in a conditional is now a reviewable defect, not a style opinion.
- Seeds must create role records in every environment (R-SEED-1).

## References

Requirements: R-ROLE-1..8. Spec: `specs/design.md` §2, §3, §8.
