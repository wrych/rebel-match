# 0028. Merge without updating the branch; previews on request

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** Andy Moesch

## Context

Several agent sessions now work in parallel, each with its own pull request.
`main`'s ruleset requires a branch to be up to date before it merges (ADR
0022), and every pull request builds an image and deploys a preview (ADR 0025).
So each merge makes every other open pull request out of date; each must merge
`main` in and run CI again, about three minutes of `check` and two or three of
build and deploy, before it can merge, by which time another has landed. Much
of the day goes to that cycle rather than to the change.

What the up-to-date rule buys is catching two pull requests that pass apart and
fail together. Textual conflicts are caught without it: GitHub refuses to merge
a pull request that conflicts with `main`. Every branch also passes the
pre-push hook (ADR 0019) before it is pushed. And nothing reaches members:
staging holds only fictional people, and it is deployed only after `check`
passes on `main`.

## Decision

- **A pull request merges when `check` is green on its own branch.** `main`'s
  ruleset no longer requires the branch to be up to date.
- **A red `main` comes first.** When `check` fails on `main`, it is fixed, or
  the pull request that broke it reverted, before anything else merges. Until
  then staging keeps serving the last commit that passed.
- **Previews are on request.** A pull request gets a preview while it carries
  the `preview` label: adding it builds and deploys, each push redeploys, and
  removing it, or closing the pull request, cleans the preview up. `check` still
  runs on every pull request.

## Alternatives considered

- **A GitHub merge queue** — tests each pull request on top of the ones ahead
  of it, with no updates by hand; the right tool, but not offered for
  repositories owned by a personal account, which this one is.
- **Keep the rule, merge less often in batches** — fewer cycles, but work waits
  on a batch, and the batch still has to be up to date.
- **Previews by a manual workflow run** — the same saving, but the pull request
  number is typed in each time; a label is one click, and an agent can set it.

## Consequences

- Each pull request runs CI once per push of its own, not once per merge of
  someone else's.
- A combination of two green pull requests can turn `main` red. It shows on
  `main`'s CI run, staging stays on the last good commit, and fixing it is the
  first job of whoever sees it.
- Previews cost nothing until asked for, and fewer run at once, which keeps
  the small non-prod database well inside its connection limit.
- A preview is no longer there by default: whoever wants to try a pull request
  on a phone adds the label first.

## References

Amends ADR 0022 (the up-to-date requirement) and ADR 0025 (a preview for every
pull request). ADR 0019.
