# 0024. Store data in Postgres through Drizzle, with PGlite for development and tests

- **Status:** Accepted
- **Date:** 2026-10-03
- **Deciders:** Andy Moesch

## Context

ADR 0002 chose MySQL because the team knew it, while calling Postgres the
better fit. Two things have changed. The app may be hosted on Google Cloud or
Azure, where managed Postgres is the first-class offer. And running the app
locally needs a MySQL server plus a hand-made `.env`, which stops a new
contributor, and an agent in a fresh container, from seeing a screen without
first finding database credentials.

Nothing is deployed yet, so no data has to move. The schema is nine migrations
and thirteen store modules of hand-written SQL, and it grows with every
journey, so a change of engine is cheapest now. The privacy rules are enforced
in SQL (a contact is read only for an accepted request by one of its parties,
ADR 0004), so whatever replaces `mysql2` has to keep queries visible.

## Decision

- **Postgres 17** is the database in production and CI. The connection is
  `node-postgres`, configured by `DATABASE_URL`.
- **Drizzle** is the query layer: a typed query builder over a schema declared
  in TypeScript (`src/db/schema.ts`). It is used as a builder, not as an object
  mapper, so every query that guards privacy reads as the SQL it runs.
- **Migrations stay SQL files** applied by our own runner (forward-only,
  ordered, refusing an edited migration, constitution §6). `drizzle-kit`
  generates them from the schema; they are reviewed and committed like any
  other code. The MySQL migrations are replaced by a fresh Postgres baseline,
  since no database holds data yet.
- **PGlite** (Postgres compiled to WebAssembly, in process) is the database for
  development and for the integration tests. In development with no
  `DATABASE_URL`, the server opens PGlite in a local data folder, migrates and
  seeds it, so `npm run dev` needs no database server. The integration tests
  open an in-memory PGlite per suite.
- **CI also runs the migrations and the integration suite against a real
  Postgres 17** service, so a difference between PGlite and Postgres fails the
  build instead of production.
- **Local runs need no `.env`.** Besides the database, the only required
  secret is `SESSION_SECRET`. When `DATABASE_URL` is unset, the server is on
  local PGlite, and only then a missing `SESSION_SECRET` is generated at random
  on first start and kept in the PGlite data folder, which git ignores. No
  secret is committed, and the condition is configuration (no database URL),
  not an environment name (constitution §5, §7). A deployment always has a
  database URL, so it never reaches this path; and config refuses
  `NODE_ENV=production` without both `DATABASE_URL` and `SESSION_SECRET`, so a
  production server fails closed rather than falling back to PGlite.

## Alternatives considered

- **Keep MySQL, add a `.env.dev` with local defaults** — fixes the first run,
  but still needs a MySQL server everywhere, and Postgres was already the better
  fit.
- **A fixed development session secret in the repository** — simpler, but a
  server wrongly started without its secret would sign cookies with a public
  key, and anyone could forge a session. A generated secret has no such
  failure.
- **A full ORM (Prisma, TypeORM)** — hides queries behind models and relations,
  where a privacy condition is easy to lose in a refactor.
- **SQLite in memory for development** — a different engine with different
  locking, types and constraints; local runs would pass where production fails.
- **A hand-written in-memory store** — a second implementation of every store
  to keep in step with the first.

## Consequences

- `npm install && npm run dev` runs the app with real Postgres semantics and no
  setup; an agent can run and screenshot it too.
- Postgres removes two MySQL workarounds: a partial unique index replaces the
  generated `pending_key` column for duplicate requests (R-CONN-5), and
  timestamps no longer need flooring to whole seconds.
- Every store is rewritten once, and the migrations restart from a new baseline.
  The integration suite is the safety net for that rewrite, above all on the
  privacy and locking paths.
- PGlite is not the production engine. The CI run against real Postgres is what
  keeps that honest; it must not be dropped to save time.
- `compose.yaml` and the MySQL CI service go. Postgres runs locally only for
  those who want to check against the real server.
- ADR 0002 still holds for Node and Express; only the database changes.

## References

Amends ADR 0002. Requirements: R-QA-2, R-QA-4, R-NFR-1, R-CONN-5, R-CFG-1,
R-DEV-1. Spec: `specs/design.md` §1, §2, §8.
