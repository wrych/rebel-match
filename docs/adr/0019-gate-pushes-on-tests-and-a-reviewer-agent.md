# 0019. Gate pushes on the test suites and a reviewer agent

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** Andy Moesch

## Context

PRs have been opened with failing tests, which costs a CI cycle and a
reviewer's attention. Review itself is mostly by agents writing the code, and a
reviewer that shares the author's context tends to agree with it. Review
comments on GitHub (Claude Code Review, a review Action) would catch more, but
put every iteration on the PR as comment noise, and cost per review.

Constitution §9 makes CI the gate and the pre-commit hook the fast feedback.
Nothing ran between the commit and the PR.

## Decision

A **pre-push hook** runs, in order:

1. `npm run lint` and `npm test`;
2. `npm run test:integration`, when `DATABASE_URL` answers — otherwise CI;
3. `npm run review`: a **reviewer agent** (`.claude/agents/reviewer.md`) with a
   fresh context and read-only tools reviews `origin/main...HEAD`.

The reviewer **files each finding under a category; config fixes its score**
(`scripts/review/config.json`): privacy or security 7, correctness 6, one of
AGENTS.md's six 5, spec or ADR contradiction 4, design rule 3, style 1. A
finding at the **threshold, 4,** blocks the push. A finding without a file,
line, rule and failure scenario is dropped. Verdicts are cached per diff.

When the `claude` CLI is missing or the reviewer fails, the review is skipped
with a warning. Agents never bypass the hook with `--no-verify`; a human may,
and says why in the PR.

## Alternatives considered

- **Claude Code Review or a review Action on GitHub** — enforceable and on the
  record, but iterations become PR comments and each review is billed. Can be
  added on top later with the same rubric.
- **Review on pre-commit** — commits are deliberately small (§1), so a
  per-commit review sees fragments and runs too often to be tolerated.
- **Let the reviewer choose a 1–7 score** — the same diff scored differently
  between runs. Fixing the score by category removes most of that.

## Consequences

- A push takes about a minute longer and costs a few tens of cents of model
  usage per new diff.
- **It is not enforced.** CI cannot tell that the hook ran, and it fails open
  without the CLI. CI remains the gate (§9); this is the fast feedback before
  it.
- **It is not deterministic.** Two runs over the same diff can disagree on
  whether a finding exists; the cache keeps one diff from being re-rolled until
  it passes. If it blocks too often, the threshold is raised in config.
- `.claude/agents/reviewer.md` is now part of the review rules: changing it
  changes what blocks a push, and it is reviewed like code.

## References

Requirements: R-QA-1, R-QA-2, R-QA-3. Constitution §8, §9. ADR 0012.
