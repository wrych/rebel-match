# 0068. Agents may rewrite their own open branch, with a lease

- **Status:** Proposed
- **Date:** 2026-11-08
- **Deciders:** Andy Moesch

## Context

Pull requests are squash-merged, so a branch's own history never reaches
`main`; only its title does. Yet CI lints every commit on the branch, and a
branch can pick up history it should not keep: a squash commit from a pull
request merged into it, a migration renumbered after `main` moved, a message
over the limit. On 2026-11-07 #344 carried a 78-character commit GitHub made
when #283 was squash-merged into its branch; the clean fix was to rebuild the
branch on `main` and push it again.

Nothing in this repository allowed or forbade that. Claude Code's safety check
in auto mode treats every force push as destructive and refuses it, so the
agent stopped and asked, twice, for a push the maintainer wanted. Its standing
instruction is never to rewrite history on someone else's branch, which says
nothing about its own.

## Decision

- **An agent may rewrite the history of its own branch** while that branch's
  pull request is open and unmerged: rebase it, squash it, reword a message,
  rebuild it on `main`. Its own means a branch it created in this work, which
  no person and no other agent has pushed to.
- **Only with a lease naming the commit it last pushed**:
  `git push --force-with-lease=<branch>:<sha>`. If anyone pushed since, the
  push is refused, and the agent stops and asks.
- **Never** `main`, a merged branch, a branch someone else pushed to, or a
  plain `--force`. The files come out the same unless the rewrite is the fix;
  the agent says in the pull request what it rewrote and why.
- **The harness allows exactly that command.** The maintainer adds
  `Bash(git push --force-with-lease:*)` to the `permissions.allow` list in
  `.claude/settings.json`, so agents push that way without asking; plain
  `--force` still asks. An agent does not grant itself this: the harness
  refuses an agent's edit to its own permissions. `main` keeps force pushes
  disabled in its branch protection, which is what holds the rule for `main`.

## Alternatives considered

- **A new branch and pull request each time** — no rewrite, but the number,
  review threads and preview are lost, and a person must close the old one.
- **Merge commits only** — keeps history, but cannot remove a bad commit
  message, which is what CI rejects.
- **Ask every time** — safe, and what happened; it stops agents on a routine
  repair the maintainer already wants.

## Consequences

- An agent can repair its own branch the way a person would, without a stop.
- A reviewer's checkout of the branch goes stale after a rewrite; the pull
  request comment says so.
- The allow rule cannot tell whose branch it is: this rule and the lease
  carry that. A harness that can tell should narrow it.
- This is a rule for every xigo project. It belongs in xigOS (xigOS ADR
  0002); this copy stands until Rebel Match moves onto xigOS.

## References

AGENTS.md "Rewriting your own branch". ADR 0019 (hooks), ADR 0022 (who
merges), ADR 0028 (merging). wrych/rebel-match#344.
