# 0002. Node.js, Express and MySQL

- **Status:** Accepted, amended by 0024
- **Date:** 2026-10-01
- **Deciders:** Andy Moesch, Ivo Pejakovic, Pascal Dulex

## Context

Rebel Match must be feature-complete by 2026-11-01 and live at the summit on
2026-11-08. It is roughly ten screens, serving up to ~350 members and a few
hundred records — no scaling problem. What matters is how fast the team can
build and host it with the skills it already has.

## Decision

Node.js with Express on the server, MySQL for storage, and a mobile-first
single-page client served by the same Node process.

## Alternatives considered

- **Postgres** — technically the better fit (JSON, full-text), but MySQL is what
  the team runs and knows. At this data size the difference is invisible.
- **A managed backend (Supabase, Firebase)** — faster to start, but the privacy
  model needs server-side authorization on every read (R-NFR-1), and that is
  clearer to get right in our own process.
- **Separate client deployment** — another moving part and a CORS surface for no
  gain at this size.

## Consequences

- One deployable, one database, no horizontal scaling (R-NFR-4).
- Authorization lives in our code, where it can be unit-tested (R-QA-1).
- Full-text search would need work if it ever matters; keyword matching in SQL
  and code covers the beta (ADR 0010).

## References

Requirements: R-NFR-4. Spec: `specs/design.md` §1, §2.
