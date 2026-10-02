# 0012. Conventional Commits, one change per pull request

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** Andy Moesch

## Context

The working rule is one change per commit, which only holds if something keeps
it honest. The repository also now has a CI pipeline that must mean something: a
gate that runs after a change has already landed on `main` reports failures
instead of preventing them.

## Decision

Commit messages follow Conventional Commits (`type(scope): subject`, imperative,
≤72 characters), enforced by commitlint in a hook and in CI. Each change goes on
a branch, opens a pull request, and is squash-merged, so `main` carries one
commit per change. Every PR cites the `R-*` requirement it serves, and an ADR
number when it implements a major decision.

## Alternatives considered

- **Conventional Commits straight to `main`** — same message discipline without
  PR overhead, appealing for a two-person team against a deadline. Rejected
  because CI then gates nothing and `main` can break during the week before the
  summit.
- **Free-form messages** — no tooling, no machine-readable history, and "one
  change per commit" degrades to an intention.

## Consequences

- `main` stays green and releasable, which matters most in the days before
  2026-11-08.
- Overhead per change: a branch and a PR, even for a one-line fix. Accepted as
  the price of a gate that works.
- The history is machine-readable, so a changelog can be generated — which is
  why no changelog is kept in source (constitution §3).
- A squashed PR is the unit of revert, matching the one-change rule.

## References

Constitution §1, §9. Requirements: R-QA-3, R-QA-6.
