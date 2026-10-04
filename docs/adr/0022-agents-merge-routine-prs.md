# 0022. Agents merge routine pull requests; people approve decisions

- **Status:** Accepted, amended by 0028
- **Date:** 2026-10-02
- **Deciders:** Andy Moesch

## Context

Most changes are written by agents and pass the same gates before a person
sees them: the pre-push hook (lint, unit and integration tests, the reviewer
agent — ADR 0019) and CI, which `main`'s ruleset requires to be green on an
up-to-date branch before a squash merge. The maintainer was approving every
pull request one by one, including mechanical ones, which slowed work without
adding judgement: the decisions behind most of them had already been made in
conversation.

There is no production deployment yet, so nothing that merges reaches members.

## Decision

An agent merges its own pull request — by enabling GitHub auto-merge, which
squash-merges once the required check is green — when the change is one of:

- a fix, refactor, test, CI or tooling change, or documentation;
- a feature implementing a `specs/tasks.md` item the maintainer has discussed;
- a spec or ADR change that records a decision the maintainer already made.

A person approves, and the agent does not enable auto-merge, when the change:

- introduces a decision the maintainer has not made: a new requirement, an ADR
  choosing between options, or a change to `docs/constitution.md`;
- weakens privacy or security, or loosens a check, whatever its size;
- changes this rule.

The agent tells the maintainer each time it merges, with the PR link. Every
merge stays in history and can be reverted; review after the fact replaces
review before it for routine changes.

## Alternatives considered

- **Approve every PR** — what happened until now: safe, but the approval was a
  click on work already decided, and it stalled stacked changes.
- **Agents merge everything** — removes the last check on decisions nobody made.

## Consequences

- Work flows without waiting for clicks; stacked PRs are rarely needed.
- The gates carry more weight: a weak test or a lax reviewer now reaches `main`
  directly. CI stays required and the reviewer's threshold stays where it is.
- **Temporary by intent.** Once a production deployment exists, approval moves
  to what reaches members — a release or deploy, or turning on a feature flag —
  and this ADR is revisited then. Auto-merge in the repository settings may be
  switched off at that point.

## References

ADR 0012 (one change per PR, squash merge), ADR 0019 (pre-push gate).
`AGENTS.md`, "Merging".
