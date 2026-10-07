# 0044. Roll back the code, never the schema; fix a migration forward

- **Status:** Accepted
- **Date:** 2026-10-07
- **Deciders:** Andy Moesch

## Context

ADR 0025 says rolling back is "promoting an earlier digest, or shifting traffic
to the previous revision". The first does not work once a migration has run in
between. Each deploy runs the image's own migrations first, and the runner
refuses a database whose ledger names a migration the image does not carry
(constitution §6, `src/migrations/plan.ts`), so the earlier image stops at its
migration job and never serves. Migrations are forward-only: there are no down
scripts to take the schema back.

A release with a migration that has to be undone is expected to be rare: the
schema changes additively (add, backfill, switch, remove, in separate commits),
and every migration has run on staging before it can be promoted.

## Decision

- **A rollback moves the code, not the schema.** Shift traffic to the previous
  Cloud Run revision. It runs on the newer schema, which the additive rule
  already requires of the release before it.
- **Promoting an earlier digest is a rollback only when no migration has run
  since.** Otherwise its migration job refuses, and the serving revision stays.
- **A bad migration is fixed forward**, with a new migration, as constitution §6
  already says for every schema change.
- No down migrations, and no restore from backup as a routine rollback. A
  restore from production's point-in-time recovery stays for losing data, not
  for undoing a release.

## Alternatives considered

- **Down migrations for every migration** — a second script per change that
  is never run until the day it matters, written against a schema that has
  moved on; costs on every change for an event we expect once, if at all.
- **Snapshot the database before each promotion and restore on rollback** —
  loses every write made since, which on the summit day is members' work.

## Consequences

- A rollback is one traffic shift, in seconds, as long as the previous
  revision still exists and §6's additive rule was kept.
- A release whose code is fine but whose migration is wrong cannot be undone,
  only followed by another migration. Its review, and its run on staging, are
  the only safety net.
- Breaking the additive rule now costs the rollback too: a migration that
  removes or renames something still read by the previous release leaves no
  revision to shift back to.

## References

Amends ADR 0025 (rolling back by promoting an earlier digest). Constitution §6.
